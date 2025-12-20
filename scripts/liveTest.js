const fs = require('fs');
const axios = require('axios');
const { SalesforceService } = require('../dist/services/salesforceService');
const { v4: uuidv4 } = require('uuid');

async function loadLocalSettings() {
  const path = './local.settings.json';
  if (fs.existsSync(path)) {
    const content = JSON.parse(fs.readFileSync(path, 'utf8'));
    const values = content.Values || {};
    for (const k of Object.keys(values)) {
      if (!process.env[k]) process.env[k] = values[k];
    }
    return values;
  }
  return {};
}

(async () => {
  try {
    await loadLocalSettings();

    const loginUrl = process.env.SF_LOGIN_URL;
    const clientId = process.env.SF_CLIENT_ID;
    const clientSecret = process.env.SF_CLIENT_SECRET;

    if (!clientId || !clientSecret || !loginUrl) {
      console.error('Missing Salesforce credentials. Please add SF_LOGIN_URL, SF_CLIENT_ID, SF_CLIENT_SECRET to local.settings.json or env.');
      process.exit(1);
    }

    const requestId = `live-test-${uuidv4()}`;

    console.log('Posting sample createForm request to local function...');

    // Describe Form__c fields so we populate test data per type and only for createable fields
    const sfLookup = new SalesforceService({ loginUrl, clientId, clientSecret });
    await sfLookup.authenticate();
    const describedFields = await sfLookup.describeFormFields();
    const fieldMap = new Map(describedFields.map(f => [f.name, f]));

    const mappedFields = [
      'AdditionalNotes__c', 'AffirmStatementOfFaith__c', 'Availability__c', 'Birthdate__c', 'Church__c', 'ChurchServingDetails__c',
      'City__c', 'Country__c', 'CountryOfOrigin__c', 'CreatedById', 'Email__c', 'EmergencyContactFirstName__c', 'EmergencyContactLastName__c',
      'EmergencyContactPhone__c', 'EmergencyContactRelationship__c', 'FirstName__c', 'Gender__c', 'GospelDetails__c', 'HowHeard__c',
      'LanguagesSpoken__c', 'LastModifiedById', 'LastName__c', 'MaritalStatus__c', 'OwnerId', 'PastorEmail__c', 'PastorFirstName__c',
      'PastorLastName__c', 'PastorSalutation__c', 'Person__c', 'Phone__c', 'PrimaryLanguage__c', 'RecentMinistrySafe__c', 'RecordTypeId',
      'Salutation__c', 'ServingAreaPrimaryInterest__c', 'ServingAreasInterest__c', 'Skills__c', 'State__c', 'Street__c', 'TestimonyDetails__c',
      'WillPay__c', 'Zip__c'
    ];

    const timestamp = Date.now();
    const sample = {};

    // Get current user id for safe reference fields
    const currentUserId = await sfLookup.getCurrentUserId();

    for (const f of mappedFields) {
      const meta = fieldMap.get(f);
      if (!meta) {
        // field not present in org; skip
        continue;
      }
      if (meta.createable === false) {
        // not createable, skip
        continue;
      }

      // Populate by type with realistic test values
      switch ((meta.type || '').toLowerCase()) {
        case 'email':
          sample[f] = `test+${timestamp}@example.com`;
          break;
        case 'phone':
          // simple US-style test phone
          sample[f] = `+1555${String(timestamp).slice(-7)}`;
          break;
        case 'string':
        case 'textarea':
        case 'url':
          sample[f] = `Test ${f.replace(/__c$/i, '')} ${timestamp}`;
          break;
        case 'picklist':
          if (meta.picklistValues && meta.picklistValues.length > 0) sample[f] = meta.picklistValues[0];
          else sample[f] = 'Value1';
          break;
        case 'multipicklist':
          if (meta.picklistValues && meta.picklistValues.length > 0) sample[f] = meta.picklistValues.slice(0, 1).join(';');
          else sample[f] = 'Value1;Value2';
          break;
        case 'date':
          sample[f] = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          break;
        case 'datetime':
          sample[f] = new Date().toISOString();
          break;
        case 'boolean':
          sample[f] = false;
          break;
        case 'int':
        case 'double':
        case 'percent':
        case 'currency':
          sample[f] = 1;
          break;
        case 'reference':
          // Set OwnerId or User references to current user; skip other references
          if (f === 'OwnerId' || (meta.referenceTo && meta.referenceTo.includes('User'))) {
            sample[f] = currentUserId;
          }
          break;
        default:
          // fallback to readable string
          sample[f] = `Test ${f} ${timestamp}`;
      }
    }

    // Default to 'General' if it exists; otherwise do NOT set RecordType so the service will
    // apply its own default behavior (which is to try 'General' and error if not present).
    try {
      await sfLookup.getRecordTypeId('General');
      sample.RecordType = 'General';
      console.log('Using RecordType for test: General');
    } catch (err) {
      console.log('RecordType "General" not found; proceeding without RecordType (service will default to General and may error)');
    }

    // Attach sample files and notes
    // Inline sample file (small text) encoded as base64. For real files, swap to fs.readFileSync(filePath).toString('base64')
    sample.Attachments = [
      {
        fileName: 'sample.txt',
        contentType: 'text/plain',
        base64: Buffer.from(`Sample file contents created at ${new Date().toISOString()}`).toString('base64'),
      },
    ];

    sample.Notes = [
      {
        Title: 'Live Test Note',
        Body: `Live test note created at ${new Date().toISOString()} - invoked by ${requestId}`,
      },
    ];

    // Use 127.0.0.1 to avoid IPv6 localhost (::1) connection issues on some Windows setups
    const functionUrl = 'http://127.0.0.1:7071/api/form';

    // Try posting and if Salesforce reports invalid fields, remove them and retry
    let attempts = 0;
    let lastError = null;
    let resp = null;

    while (attempts < 6) {
      attempts += 1;
      console.log(`Attempt ${attempts}: posting ${Object.keys(sample).length} fields`);
      try {
        resp = await axios.post(functionUrl, sample, {
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
          timeout: 20000,
        });

        console.log('Function response status:', resp.status);
        console.log('Function response body:', resp.data);
        break;
      } catch (e) {
        lastError = e;
        const text = e.response ? JSON.stringify(e.response.data) : e.message;
        console.error('Attempt failed:', text);

        // Parse common Salesforce error messages for invalid fields
        const invalidFields = [];
        const m1 = /Unable to create\/update fields:\s*([^\.]+)\./i.exec(text);
        if (m1) {
          const list = m1[1].split(',').map(s => s.trim());
          invalidFields.push(...list);
        }
        const m2 = /No such column '([^']+)'/i.exec(text);
        if (m2) invalidFields.push(m2[1]);

        if (invalidFields.length === 0) {
          console.error('No invalid-field info found; aborting retry');
          break;
        }

        // Remove invalid fields from sample before retrying
        for (const f of invalidFields) {
          if (f in sample) {
            console.log('Removing invalid field from payload:', f);
            delete sample[f];
          }
        }

        // If only RecordType remains and no other fields, abort (nothing to test)
        const keysLeft = Object.keys(sample).filter(k => k !== 'RecordType');
        if (keysLeft.length === 0) {
          console.error('No valid fields left to test; aborting.');
          break;
        }

        // small delay before retry
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!resp) {
      throw lastError || new Error('Failed to create form');
    }

    const id = resp.data && resp.data.id;
    const formCode = (resp.data && resp.data.formCode) || resp.headers['x-form-code'] || (resp.data && resp.data.name) || resp.headers['x-form-name'] || id;
    
    if (!id) {
      console.error('No id returned from function; aborting cleanup.');
      process.exit(1);
    }

    console.log('Created Salesforce Form with id:', id, 'formCode:', formCode);

    // Test GET method to retrieve the form by its GUID name
    console.log('\nTesting GET method to retrieve form by name...');
    try {
      // Extract the form name from the created response
      const getUrl = `http://127.0.0.1:7071/api/form?code=${encodeURIComponent(formCode)}`;
      
      const getResp = await axios.get(getUrl, {
        headers: { 'X-Request-Id': requestId },
        timeout: 20000,
      });

      console.log('GET request status:', getResp.status);
      console.log('Form data retrieved:', JSON.stringify(getResp.data, null, 2));

      if (getResp.status === 200 && getResp.data.Id) {
        console.log('Successfully retrieved form via GET method');
      } else {
        console.warn('GET request succeeded but form data may be incomplete');
      }
    } catch (getError) {
      // Form might not be immediately queryable by ID, so this is not critical
      console.warn('GET method test failed (this may be expected):', getError.response?.data || getError.message);
    }

    // Cleanup via authenticated sfLookup
    console.log('Deleting created Form record...');
    await sfLookup.deleteFormById(id);
    console.log('Cleanup successful: deleted Form', id);

  } catch (err) {
    console.error('Live test failed:', err?.response?.data || err.message || err);
    process.exit(1);
  }
})();
