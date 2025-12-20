// Common test environment setup: provide default Salesforce test credentials
process.env.SF_CLIENT_ID = process.env.SF_CLIENT_ID ?? 'test-client-id';
process.env.SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET ?? 'test-client-secret';
process.env.SF_LOGIN_URL = process.env.SF_LOGIN_URL ?? 'https://login.salesforce.com';
