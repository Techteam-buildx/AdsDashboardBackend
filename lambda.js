// AWS Lambda entry point (API Gateway REST/HTTP API + EventBridge schedule).
const serverless = require('serverless-http');
const { expressApp, warm } = require('./index');

const httpHandler = serverless(expressApp);

module.exports.handler = async (event, context) => {
  // EventBridge schedule: keep this container's caches populated so user
  // requests are served from memory instead of calling Zoho / Meta / Google.
  if (event && (event.source === 'aws.events' || event.warm)) {
    const result = await warm();
    console.log('[warm]', JSON.stringify(result));
    return result;
  }
  return httpHandler(event, context);
};
