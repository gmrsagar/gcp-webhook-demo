'use strict';

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_API_KEY, {
  apiVersion: '2020-08-27'
});
// This is your Stripe CLI webhook secret for testing your endpoint locally.
const endpointSecret = process.env.STRIPE_WEBHOOK_KEY;
const { PubSub } = require('@google-cloud/pubsub');
const app = express();
app.use(express.urlencoded());

app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function (req, res, buf) {
      req.rawBody = buf.toString();
    },
  })
);

app.post('/', async (request, response) => {
  const sig = request.headers['stripe-signature'];
  const pubSubClient = new PubSub({ projectId: 'ambient-sphere-401108' });
  const topicNameOrId = 'stripe-transaction';
  let data;
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      request.rawBody,
      sig,
      endpointSecret
    );
  } catch (err) {
    event = request.body;
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntentSucceeded = event.data.object;
      data = paymentIntentSucceeded.status;
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  async function publishMessage(topicNameOrId, data) {
    const dataBuffer = Buffer.from(data);

    try {
      const messageId = await pubSubClient
        .topic(topicNameOrId)
        .publishMessage({ data: dataBuffer });
      console.log(`Message ${messageId} published.`);
    } catch (error) {
      console.error(`Received error while publishing: ${error.message}`);
      response.status(400).send(`Received error while publishing: ${error.message}`);
    }
  }

  await publishMessage(topicNameOrId, data).catch(err => {
    console.error(`Received error while publishing: ${err.message}`);
    response.status(400).send(`Received error while publishing: ${err.message}`);
  });

  response.status(200).send('All done')
  return;
})

app.listen(4242);

/**
 * Producer handler
 */
exports.http = app;

/**
 * Consumer handler
 */
exports.event = (event, context, callback) => {
  console.log('Transaction Complete');
}