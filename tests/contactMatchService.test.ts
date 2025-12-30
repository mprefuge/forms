import { ContactMatchService, ContactMatchCriteria } from '../src/services/contactMatchService';

describe('ContactMatchService', () => {
  let service: ContactMatchService;

  beforeEach(() => {
    service = new ContactMatchService();
  });

  describe('findBestMatch', () => {
    it('should find a match with email address', () => {
      const criteria: ContactMatchCriteria = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '555-123-4567',
      };

      const contacts = [
        {
          Id: 'contact123',
          FirstName: 'John',
          LastName: 'Doe',
          Email: 'john.doe@example.com',
          Phone: '555-123-4567',
          Secondary_Email__c: null,
          MailingStreet: null,
          MailingCity: null,
          MailingState: null,
          MailingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 70);

      expect(result).not.toBeNull();
      expect(result?.contactId).toBe('contact123');
      expect(result?.contactName).toBe('John Doe');
      expect(result?.confidenceScore).toBeGreaterThanOrEqual(70);
      expect(result?.matchedFields).toContain('email');
    });

    it('should find a match with phone number only', () => {
      const criteria: ContactMatchCriteria = {
        phone: '555-123-4567',
      };

      const contacts = [
        {
          Id: 'contact456',
          FirstName: 'Jane',
          LastName: 'Smith',
          Email: null,
          Phone: '555-123-4567',
          Secondary_Email__c: null,
          MailingStreet: null,
          MailingCity: null,
          MailingState: null,
          MailingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 25);

      expect(result).not.toBeNull();
      expect(result?.contactId).toBe('contact456');
      expect(result?.matchedFields).toContain('phone');
    });

    it('should handle phone number formatting differences', () => {
      const criteria: ContactMatchCriteria = {
        phone: '(555) 123-4567',
      };

      const contacts = [
        {
          Id: 'contact789',
          FirstName: 'Bob',
          LastName: 'Johnson',
          Email: null,
          Phone: '555-123-4567',
          Secondary_Email__c: null,
          MailingStreet: null,
          MailingCity: null,
          MailingState: null,
          MailingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 25);

      expect(result).not.toBeNull();
      expect(result?.matchedFields).toContain('phone');
    });

    it('should find a match with secondary email', () => {
      const criteria: ContactMatchCriteria = {
        secondaryEmail: 'jane.work@company.com',
      };

      const contacts = [
        {
          Id: 'contact999',
          FirstName: 'Jane',
          LastName: 'Doe',
          Email: 'jane@personal.com',
          Phone: null,
          Secondary_Email__c: 'jane.work@company.com',
          MailingStreet: null,
          MailingCity: null,
          MailingState: null,
          MailingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 20);

      expect(result).not.toBeNull();
      expect(result?.contactId).toBe('contact999');
      expect(result?.matchedFields).toContain('secondaryEmail');
    });

    it('should return null when no match meets confidence threshold', () => {
      const criteria: ContactMatchCriteria = {
        firstName: 'John',
        lastName: 'Doe',
      };

      const contacts = [
        {
          Id: 'contact123',
          FirstName: 'Jane',
          LastName: 'Smith',
          Email: 'jane@example.com',
          Phone: '555-999-9999',
          Secondary_Email__c: null,
          MailingStreet: null,
          MailingCity: null,
          MailingState: null,
          MailingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 70);

      expect(result).toBeNull();
    });

    it('should return null when contacts array is empty', () => {
      const criteria: ContactMatchCriteria = {
        email: 'test@example.com',
      };

      const result = service.findBestMatch(criteria, [], 70);

      expect(result).toBeNull();
    });

    it('should select highest confidence match when multiple matches exist', () => {
      const criteria: ContactMatchCriteria = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
      };

      const contacts = [
        {
          Id: 'contact1',
          FirstName: 'John',
          LastName: 'Smith',
          Email: 'john@example.com',
          Phone: '555-999-9999',
          Secondary_Email__c: null,
          BillingStreet: null,
          BillingCity: null,
          BillingState: null,
          BillingPostalCode: null,
        },
        {
          Id: 'contact2',
          FirstName: 'John',
          LastName: 'Doe',
          Email: 'john@example.com',
          Phone: '555-123-4567',
          Secondary_Email__c: null,
          BillingStreet: null,
          BillingCity: null,
          BillingState: null,
          BillingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 70);

      expect(result?.contactId).toBe('contact2');
      expect(result?.confidenceScore).toBeGreaterThan(50);
    });

    it('should handle case-insensitive email matching', () => {
      const criteria: ContactMatchCriteria = {
        email: 'JOHN.DOE@EXAMPLE.COM',
      };

      const contacts = [
        {
          Id: 'contact123',
          FirstName: 'John',
          LastName: 'Doe',
          Email: 'john.doe@example.com',
          Phone: null,
          Secondary_Email__c: null,
          BillingStreet: null,
          BillingCity: null,
          BillingState: null,
          BillingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 25);

      expect(result).not.toBeNull();
      expect(result?.matchedFields).toContain('email');
    });

    it('should calculate correct confidence scores', () => {
      const criteria: ContactMatchCriteria = {
        email: 'test@example.com',
        phone: '555-1234',
        firstName: 'John',
        lastName: 'Doe',
      };

      const contacts = [
        {
          Id: 'contact1',
          FirstName: 'John',
          LastName: 'Doe',
          Email: 'test@example.com',
          Phone: '555-1234',
          Secondary_Email__c: null,
          BillingStreet: null,
          BillingCity: null,
          BillingState: null,
          BillingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 0);

      expect(result?.confidenceScore).toBe(80);
    });
  });

  describe('buildContactSearchQuery', () => {
    it('should build query with email criterion', () => {
      const criteria: ContactMatchCriteria = {
        email: 'test@example.com',
      };

      const query = service.buildContactSearchQuery(criteria);

      expect(query).toContain("(Email = 'test@example.com' OR Secondary_Email__c = 'test@example.com')");
      expect(query).toContain('SELECT Id, FirstName, LastName, Email, Phone, Secondary_Email__c');
    });

    it('should build query with phone criterion', () => {
      const criteria: ContactMatchCriteria = {
        phone: '555-123-4567',
      };

      const query = service.buildContactSearchQuery(criteria);

      expect(query).toContain("Phone = '555-123-4567'");
    });

    it('should build query with multiple criteria', () => {
      const criteria: ContactMatchCriteria = {
        email: 'test@example.com',
        phone: '555-123-4567',
        firstName: 'John',
        lastName: 'Doe',
      };

      const query = service.buildContactSearchQuery(criteria);

      expect(query).toContain("(Email = 'test@example.com' OR Secondary_Email__c = 'test@example.com')");
      expect(query).toContain("Phone = '555-123-4567'");
      expect(query).toContain("FirstName = 'John' AND LastName = 'Doe'");
    });

    it('should throw error when no criteria provided', () => {
      const criteria: ContactMatchCriteria = {};

      expect(() => {
        service.buildContactSearchQuery(criteria);
      }).toThrow('At least one contact matching criterion must be provided');
    });

    it('should escape single quotes in criteria values', () => {
      const criteria: ContactMatchCriteria = {
        email: "test'quote@example.com",
      };

      const query = service.buildContactSearchQuery(criteria);

      expect(query).toContain("(Email = 'test\\'quote@example.com' OR Secondary_Email__c = 'test\\'quote@example.com')");
    });

    it('should include address fields in query', () => {
      const criteria: ContactMatchCriteria = {
        city: 'Denver',
        state: 'CO',
      };

      const query = service.buildContactSearchQuery(criteria);

      expect(query).toContain("MailingCity = 'Denver'");
      expect(query).toContain("MailingState = 'CO'");
      expect(query).toContain('MailingStreet, MailingCity, MailingState, MailingPostalCode');
    });
  });

  describe('Fuzzy Name Matching', () => {
    it('should match William and Will as first names', () => {
      const criteria: ContactMatchCriteria = {
        firstName: 'Will',
        email: 'will@example.com',
      };

      const contacts = [
        {
          Id: 'contact123',
          FirstName: 'William',
          LastName: 'Smith',
          Email: 'will@example.com',
          Phone: null,
          Secondary_Email__c: null,
          MailingStreet: null,
          MailingCity: null,
          MailingState: null,
          MailingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 40);

      expect(result).not.toBeNull();
      expect(result?.contactId).toBe('contact123');
      expect(result?.matchedFields).toContain('firstName');
    });

    it('should match Bill and William as first names', () => {
      const criteria: ContactMatchCriteria = {
        firstName: 'Bill',
        email: 'bill@example.com',
      };

      const contacts = [
        {
          Id: 'contact456',
          FirstName: 'William',
          LastName: 'Jones',
          Email: 'bill@example.com',
          Phone: null,
          Secondary_Email__c: null,
          MailingStreet: null,
          MailingCity: null,
          MailingState: null,
          MailingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 40);

      expect(result).not.toBeNull();
      expect(result?.matchedFields).toContain('firstName');
    });

    it('should match Richard and Rick as first names', () => {
      const criteria: ContactMatchCriteria = {
        firstName: 'Rick',
        lastName: 'Davis',
        email: 'rick@example.com',
      };

      const contacts = [
        {
          Id: 'contact789',
          FirstName: 'Richard',
          LastName: 'Davis',
          Email: 'rick@example.com',
          Phone: null,
          Secondary_Email__c: null,
          BillingStreet: null,
          BillingCity: null,
          BillingState: null,
          BillingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 40);

      expect(result).not.toBeNull();
      expect(result?.matchedFields).toContain('firstName');
    });

    it('should match Elizabeth and Liz as first names', () => {
      const criteria: ContactMatchCriteria = {
        firstName: 'Liz',
        email: 'liz@example.com',
      };

      const contacts = [
        {
          Id: 'contact999',
          FirstName: 'Elizabeth',
          LastName: 'Brown',
          Email: 'liz@example.com',
          Phone: null,
          Secondary_Email__c: null,
          BillingStreet: null,
          BillingCity: null,
          BillingState: null,
          BillingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 40);

      expect(result).not.toBeNull();
      expect(result?.matchedFields).toContain('firstName');
    });

    it('should use fuzzy matching for close names', () => {
      const criteria: ContactMatchCriteria = {
        firstName: 'Jon',
        email: 'jon@example.com',
      };

      const contacts = [
        {
          Id: 'contact111',
          FirstName: 'John',
          LastName: 'Miller',
          Email: 'jon@example.com',
          Phone: null,
          Secondary_Email__c: null,
          BillingStreet: null,
          BillingCity: null,
          BillingState: null,
          BillingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 40);

      expect(result).not.toBeNull();
      expect(result?.matchedFields).toContain('firstName');
    });
  });

  describe('Address Matching', () => {
    it('should match contacts by city and state', () => {
      const criteria: ContactMatchCriteria = {
        email: 'test@example.com',
        city: 'Denver',
        state: 'Colorado',
      };

      const contacts = [
        {
          Id: 'contact200',
          FirstName: 'John',
          LastName: 'Doe',
          Email: 'test@example.com',
          Phone: null,
          Secondary_Email__c: null,
          MailingStreet: '123 Main St',
          MailingCity: 'Denver',
          MailingState: 'Colorado',
          MailingPostalCode: '80202',
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 30);

      expect(result).not.toBeNull();
      expect(result?.matchedFields).toContain('city');
      expect(result?.matchedFields).toContain('state');
    });

    it('should match contacts by zip code', () => {
      const criteria: ContactMatchCriteria = {
        email: 'test@example.com',
        zip: '80202',
      };

      const contacts = [
        {
          Id: 'contact300',
          FirstName: 'Jane',
          LastName: 'Smith',
          Email: 'test@example.com',
          Phone: null,
          Secondary_Email__c: null,
          MailingStreet: '456 Oak Ave',
          MailingCity: 'Denver',
          MailingState: 'CO',
          MailingPostalCode: '80202',
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 37);

      expect(result).not.toBeNull();
      expect(result?.matchedFields).toContain('zip');
    });

    it('should identify empty address fields for update', () => {
      const criteria: ContactMatchCriteria = {
        email: 'test@example.com',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        street: '999 Pine St',
      };

      const contacts = [
        {
          Id: 'contact400',
          FirstName: 'Tom',
          LastName: 'Jones',
          Email: 'test@example.com',
          Phone: null,
          Secondary_Email__c: null,
          MailingStreet: null,
          MailingCity: 'Portland',
          MailingState: 'OR',
          MailingPostalCode: null,
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 40);

      expect(result).not.toBeNull();
      expect(result?.fieldsToUpdate).toBeDefined();
      expect(result?.fieldsToUpdate?.MailingStreet).toBe('999 Pine St');
      expect(result?.fieldsToUpdate?.MailingPostalCode).toBe('97201');
    });

    it('should not update non-empty address fields', () => {
      const criteria: ContactMatchCriteria = {
        email: 'test@example.com',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        street: '999 Pine St',
      };

      const contacts = [
        {
          Id: 'contact500',
          FirstName: 'Jane',
          LastName: 'Doe',
          Email: 'test@example.com',
          Phone: null,
          Secondary_Email__c: null,
          MailingStreet: '123 Existing St',
          MailingCity: 'Portland',
          MailingState: 'OR',
          MailingPostalCode: '97202',
        },
      ];

      const result = service.findBestMatch(criteria, contacts, 40);

      expect(result).not.toBeNull();
      expect(result?.fieldsToUpdate).toBeUndefined();
    });
  });
});
