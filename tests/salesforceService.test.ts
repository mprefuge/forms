import { SalesforceService } from '../src/services/salesforceService';

describe('SalesforceService - default RecordType behavior', () => {
  it('uses RecordType name "General" when none provided', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });

    // spy on getRecordTypeId to ensure it's called with 'General'
    const getRTSpy = jest.spyOn(sf as any, 'getRecordTypeId').mockResolvedValue('rt-general-id');

    // mock connection.sobject().create and capture payload
    const createMock = jest.fn().mockResolvedValue({ success: true, id: 'form123' });
    (sf as any).connection = {
      sobject: jest.fn().mockReturnValue({
        create: createMock,
        describe: jest.fn().mockResolvedValue({ fields: [] }),
      }),
      query: jest.fn().mockResolvedValue({ records: [] }),
    };

    const result = await (sf as any).createForm({}, 'req-1');

    expect(getRTSpy).toHaveBeenCalledWith('General');
    expect(result.id).toBe('form123');

    // Ensure the FormCode__c was generated and matches 5 lowercase alphanumeric characters
    expect(createMock).toHaveBeenCalled();
    const createdObj = createMock.mock.calls[0][0];
    expect(createdObj.FormCode__c).toMatch(/^[a-z0-9]{5}$/);
    expect(result.formCode).toMatch(/^[a-z0-9]{5}$/);
  });

  it('overrides provided Name with generated GUID', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });

    jest.spyOn(sf as any, 'getRecordTypeId').mockResolvedValue('rt-general-id');

    const createMock = jest.fn().mockResolvedValue({ success: true, id: 'form456' });
    (sf as any).connection = {
      sobject: jest.fn().mockReturnValue({
        create: createMock,
        describe: jest.fn().mockResolvedValue({ fields: [] }),
      }),
      query: jest.fn().mockResolvedValue({ records: [] }),
    } as any;

    const result = await (sf as any).createForm({ Name: 'Test Name 1766244308895', FormCode__c: 'supplied' }, 'req-3');

    expect(createMock).toHaveBeenCalled();
    const createdObj = createMock.mock.calls[0][0];
    expect(createdObj.FormCode__c).toMatch(/^[a-z0-9]{5}$/);
    expect(result.formCode).toMatch(/^[a-z0-9]{5}$/);
  });

  it('retries generation when FormCode__c collides and then succeeds', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });

    jest.spyOn(sf as any, 'getRecordTypeId').mockResolvedValue('rt-general-id');

    const createMock = jest.fn().mockResolvedValue({ success: true, id: 'form789' });

    (sf as any).connection = {
      sobject: jest.fn().mockReturnValue({ create: createMock, describe: jest.fn().mockResolvedValue({ fields: [] }) }),
      query: jest.fn().mockImplementation((q: string) => {
        // simulate a collision for first generated value 'dup01' then no collision for 'dup02'
        if (q.includes("dup01")) return Promise.resolve({ records: [{ Id: 'existing' }] });
        return Promise.resolve({ records: [] });
      }),
    } as any;

    // Force the generator to return dup01 first, then dup02
    jest.spyOn(sf as any, 'generateFormCodeGuid')
      .mockImplementationOnce(() => 'dup01')
      .mockImplementationOnce(() => 'dup02');

    const result = await (sf as any).createForm({}, 'req-dup');

    expect(createMock).toHaveBeenCalled();
    const createdObj = createMock.mock.calls[0][0];
    expect(createdObj.FormCode__c).toBe('dup02');
    expect(result.formCode).toBe('dup02');
  });

  it('throws when default RecordType "General" is not found', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });

    jest.spyOn(sf as any, 'getRecordTypeId').mockRejectedValue(new Error('RecordType not found: General'));

    (sf as any).connection = {
      sobject: jest.fn().mockReturnValue({
        create: jest.fn(),
      }),
    };

    await expect((sf as any).createForm({}, 'req-2')).rejects.toThrow('RecordType not found: General');
  });

  it('creates attachments and links them as ContentDocumentLink', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });

    const createMock = jest.fn()
      .mockResolvedValueOnce({ success: true, id: 'cv1' }) // ContentVersion create
      .mockResolvedValueOnce({ success: true, id: 'link1' }); // ContentDocumentLink create

    (sf as any).connection = {
      sobject: jest.fn().mockImplementation((name: string) => {
        if (name === 'ContentVersion') return { create: createMock };
        if (name === 'ContentDocumentLink') return { create: createMock };
        return { create: jest.fn() };
      }),
      query: jest.fn().mockResolvedValue({ records: [{ ContentDocumentId: 'cd1' }] }),
    } as any;

    const links = await (sf as any).createAttachments('form1', [{ fileName: 'f.txt', base64: 'YWI=' }]);

    expect(links).toEqual(['link1']);
    expect((sf as any).connection.sobject).toHaveBeenCalledWith('ContentVersion');
    expect((sf as any).connection.sobject).toHaveBeenCalledWith('ContentDocumentLink');
  });

  it('creates notes for the form', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });

    (sf as any).connection = {
      sobject: jest.fn().mockReturnValue({ create: jest.fn().mockResolvedValue({ success: true, id: 'note1' }) }),
    } as any;

    const ids = await (sf as any).createNotes('form1', [{ Title: 'T', Body: 'B' }]);

    expect(ids).toEqual(['note1']);
    expect((sf as any).connection.sobject).toHaveBeenCalledWith('Note');
  });

  it('normalizes multipicklist values (pipes -> semicolons) when creating forms', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });

    jest.spyOn(sf as any, 'getRecordTypeId').mockResolvedValue('rt-general-id');

    // Simulate describeFormFields returning LanguagesSpoken__c as multipicklist
    jest.spyOn(sf as any, 'describeFormFields').mockResolvedValue([
      { name: 'LanguagesSpoken__c', type: 'multipicklist', picklistValues: ['English', 'American Sign Language'] }
    ] as any);

    const createMock = jest.fn().mockResolvedValue({ success: true, id: 'form-mp' });
    (sf as any).connection = {
      sobject: jest.fn().mockReturnValue({ create: createMock }),
      query: jest.fn().mockResolvedValue({ records: [] }),
    } as any;

    const result = await (sf as any).createForm({ LanguagesSpoken__c: 'English|American Sign Language' }, 'req-mp');

    expect(createMock).toHaveBeenCalled();
    const createdObj = createMock.mock.calls[0][0];
    expect(createdObj.LanguagesSpoken__c).toBe('English;American_Sign_Language');
    expect(result.id).toBe('form-mp');
  });

  it('normalizes multipicklist values on update (array and pipes)', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });

    // Prepare describe() result with an updateable multipicklist
    const desc = {
      fields: [
        { name: 'LanguagesSpoken__c', type: 'multipicklist', updateable: true },
      ],
    } as any;

    const updateMock = jest.fn().mockResolvedValue({ success: true });
    (sf as any).connection = {
      sobject: jest.fn().mockImplementation((name: string) => {
        if (name === 'Form__c') return { describe: jest.fn().mockResolvedValue(desc), update: updateMock };
        return { create: jest.fn() };
      }),
    } as any;

    // Test with array input
    await (sf as any).updateForm('form-1', { LanguagesSpoken__c: ['English', 'American Sign Language'] }, 'req-mp-update');

    expect(updateMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ Id: 'form-1', LanguagesSpoken__c: 'English;American_Sign_Language' }));

    // Reset calls and test with pipe-delimited input
    updateMock.mockClear();
    await (sf as any).updateForm('form-1', { LanguagesSpoken__c: 'English|American Sign Language' }, 'req-mp-update-2');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ Id: 'form-1', LanguagesSpoken__c: 'English;American_Sign_Language' }));
  });

  it('encodes spaces to underscores for picklist values when creating forms', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });
    jest.spyOn(sf as any, 'getRecordTypeId').mockResolvedValue('rt-general-id');

    // Simulate a single-select picklist field
    jest.spyOn(sf as any, 'describeFormFields').mockResolvedValue([
      { name: 'ServingAreasInterest__c', type: 'picklist', picklistValues: ['ESL_Network', 'Other'] }
    ] as any);

    const createMock = jest.fn().mockResolvedValue({ success: true, id: 'form-pick' });
    (sf as any).connection = {
      sobject: jest.fn().mockReturnValue({ create: createMock }),
      query: jest.fn().mockResolvedValue({ records: [] }),
    } as any;

    const result = await (sf as any).createForm({ ServingAreasInterest__c: 'ESL Network' }, 'req-pick');

    expect(createMock).toHaveBeenCalled();
    const createdObj = createMock.mock.calls[0][0];
    expect(createdObj.ServingAreasInterest__c).toBe('ESL_Network');
    expect(result.id).toBe('form-pick');
  });

  it('encodes spaces to underscores for picklist values on update', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });

    const desc = {
      fields: [
        { name: 'ServingAreasInterest__c', type: 'picklist', updateable: true },
      ],
    } as any;

    const updateMock = jest.fn().mockResolvedValue({ success: true });
    (sf as any).connection = {
      sobject: jest.fn().mockImplementation((name: string) => {
        if (name === 'Form__c') return { describe: jest.fn().mockResolvedValue(desc), update: updateMock };
        return { create: jest.fn() };
      }),
    } as any;

    await (sf as any).updateForm('form-1', { ServingAreasInterest__c: 'ESL Network' }, 'req-update-pick');

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ Id: 'form-1', ServingAreasInterest__c: 'ESL_Network' }));
  });

  it('encodes spaces to underscores for multipicklist values when creating forms', async () => {
    const sf = new SalesforceService({ loginUrl: 'https://login.salesforce.com', clientId: 'id', clientSecret: 'secret' });
    jest.spyOn(sf as any, 'getRecordTypeId').mockResolvedValue('rt-general-id');

    // Simulate multipicklist with expected encoded picklist values
    jest.spyOn(sf as any, 'describeFormFields').mockResolvedValue([
      { name: 'LanguagesSpoken__c', type: 'multipicklist', picklistValues: ['English', 'American_Sign_Language'] }
    ] as any);

    const createMock = jest.fn().mockResolvedValue({ success: true, id: 'form-mp-enc' });
    (sf as any).connection = {
      sobject: jest.fn().mockReturnValue({ create: createMock }),
      query: jest.fn().mockResolvedValue({ records: [] }),
    } as any;

    const result = await (sf as any).createForm({ LanguagesSpoken__c: 'English|American Sign Language' }, 'req-mp-enc');

    expect(createMock).toHaveBeenCalled();
    const createdObj = createMock.mock.calls[0][0];
    expect(createdObj.LanguagesSpoken__c).toBe('English;American_Sign_Language');
    expect(result.id).toBe('form-mp-enc');
  });

});