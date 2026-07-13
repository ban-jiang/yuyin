const vercelHandler = require('../../api/search.js');

exports.handler = async function (event) {
  let statusCode = 200;
  let responseBody = {};
  const req = {
    method: event.httpMethod,
    body: event.body || '{}'
  };
  const res = {
    writeHead(status) { statusCode = status; },
    end(body) { responseBody = JSON.parse(body || '{}'); }
  };
  await vercelHandler(req, res);
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(responseBody)
  };
};
