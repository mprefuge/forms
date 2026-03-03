import { SalesforceServiceConfig } from '../../services/salesforceService';

export function buildSalesforceConfig(): SalesforceServiceConfig {
  return {
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
    clientId: process.env.SF_CLIENT_ID || '',
    clientSecret: process.env.SF_CLIENT_SECRET || '',
  };
}