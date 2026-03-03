export interface ErrorMappingOptions {
  includeRecordTypeNotFound?: boolean;
  includeSalesforceError?: boolean;
  includeFormNotFound?: boolean;
  includeInvalidField?: boolean;
  includeMissingCredentials?: boolean;
}

export function mapCommonHandlerError(
  error: any,
  options: ErrorMappingOptions = {}
): { statusCode: number; errorMessage: string } {
  let statusCode = 500;
  let errorMessage = 'Internal server error';

  if (options.includeRecordTypeNotFound && error.message?.includes('RecordType not found')) {
    statusCode = 400;
    errorMessage = error.message;
  } else if (options.includeSalesforceError && error.message?.includes('Salesforce error')) {
    statusCode = 400;
    errorMessage = error.message;
  } else if (options.includeFormNotFound && error.message?.includes('Form not found')) {
    statusCode = 404;
    errorMessage = error.message;
  } else if (options.includeInvalidField && error.message?.includes('Invalid field')) {
    statusCode = 400;
    errorMessage = error.message;
  } else if (options.includeMissingCredentials && error.message?.includes('Missing Salesforce credentials')) {
    statusCode = 500;
    errorMessage = 'Missing Salesforce credentials';
  }

  return { statusCode, errorMessage };
}