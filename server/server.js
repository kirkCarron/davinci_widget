require('dotenv').config();

const path = require('node:path');
const Fastify = require('fastify');
const fastifyCookie = require('@fastify/cookie');
const fastifyCors = require('@fastify/cors');
const fastifyStatic = require('@fastify/static');

const fastify = Fastify({ logger: true });

fastify.register(fastifyCookie);

fastify.register(fastifyCors, {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: true,
});

// The Docker build copies the built React app (client/dist) here.
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// Only non-secret config the browser needs to bootstrap the widget.
fastify.get('/widget-config', async (request, reply) => {
  return reply.send({
    region: process.env.PINGONE_REGION || 'com',
    policyId: process.env.BXI_POLICY_ID,
  });
});

// Exchanges the server-side API key for a DaVinci SDK token. Must stay server-side
// per PingOne docs: the API key must never be exposed to the browser.
fastify.post('/dvtoken', {
  schema: {
    body: {
      type: 'object',
      required: ['policyId'],
      properties: {
        policyId: { type: 'string' },
        apiKey: { type: 'string' },
        companyId: { type: 'string' },
        flowParameters: { type: 'object' },
      },
    },
  },
}, async function (request, reply) {
  const apiKey = request.body?.apiKey || process.env.BXI_API_KEY;
  const companyId = request.body?.companyId || process.env.BXI_COMPANY_ID;

  if (!apiKey || !companyId) {
    return reply.code(500).send({
      error: 'Server is missing BXI_API_KEY or BXI_COMPANY_ID configuration.',
    });
  }

  const body = {
    policyId: request.body.policyId,
  };
  if (request.cookies?.['DV-ST']) {
    body.global = { sessionToken: request.cookies['DV-ST'] };
  }

  if (request.body?.flowParameters) {
    body.parameters = request.body.flowParameters;
  }

  const dvBaseUrl = `${process.env.BXI_API_URL}/`;
  const dvSdkTokenBaseUrl = `${process.env.BXI_SDK_TOKEN_URL}/v1`;

  let parsedResponse;
  try {
    const tokenResponse = await fetch(
      `${dvSdkTokenBaseUrl}/company/${companyId}/sdktoken`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SK-API-KEY': apiKey,
        },
        body: JSON.stringify(body),
      }
    ); // Endpoint is case sensitive in DaVinci V2
    parsedResponse = await tokenResponse.json();
  } catch (err) {
    request.log.error(err, 'Failed to reach DaVinci sdktoken endpoint');
    return reply.code(502).send({ error: 'Unable to reach DaVinci sdktoken endpoint.' });
  }

  if (!parsedResponse?.success) {
    request.log.error({ parsedResponse }, 'DaVinci sdktoken request was not successful');
    return reply.code(500).send({
      error: `An error occurred getting DaVinci token. code: ${parsedResponse?.httpResponseCode}, message: '${parsedResponse?.message}'.`,
    });
  }

  request.log.info('Successfully retrieved sdktoken for DaVinci');

  return reply.send({
    token: parsedResponse.access_token,
    companyId,
    apiRoot: dvBaseUrl,
  });
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
