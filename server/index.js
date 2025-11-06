import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(bodyParser.json());

const {
  PHONEPE_BASE_URL, MERCHANT_ID, MERCHANT_SALT, SALT_INDEX,
  CALLBACK_URL, TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
} = process.env;

import Twilio from 'twilio';
const twilio = new Twilio(TWILIO_SID, TWILIO_TOKEN);

function genOrderId(){ return 'PHY' + Date.now(); }
function buildXVerify(payloadObj, apiPath){
  const payload = JSON.stringify(payloadObj);
  const b64 = Buffer.from(payload).toString('base64');
  const toHash = b64 + apiPath + MERCHANT_SALT;
  const hashed = crypto.createHash('sha256').update(toHash).digest('hex');
  return `${hashed}###${SALT_INDEX}`;
}

app.post('/api/create-payment', async (req, res) => {
  try {
    const { amount, buyerPhone, buyerName } = req.body;
    if (!amount || !buyerPhone) return res.status(400).json({ error: 'missing fields' });

    const orderId = genOrderId();
    const amountPaise = Math.round(Number(amount) * 100);

    // persist order (example: simple file or DB). Minimal in-memory for demo (not for prod).
    // saveOrder({ orderId, amountPaise, status:'pending', buyerPhone, createdAt:Date.now() });

    const payload = {
      merchantId: MERCHANT_ID,
      transactionId: orderId,
      amount: amountPaise,
      redirectUrl: CALLBACK_URL,
      phone: buyerPhone,
      customerName: buyerName || ''
    };

    const apiPath = '/v3/charge'; // confirm exact path in PhonePe docs or replace with collect API path
    const xVerify = buildXVerify(payload, apiPath);

    const headers = { 'Content-Type':'application/json', 'X-VERIFY': xVerify, 'X-CALLBACK-URL': CALLBACK_URL };
    const url = `${PHONEPE_BASE_URL}${apiPath}`;

    const phonepeResp = await axios.post(url, payload, { headers, timeout:10000 });
    const paymentUrl = phonepeResp?.data?.data?.paymentUrl || phonepeResp?.data?.data?.redirectUrl || phonepeResp?.data?.data?.deeplink;

    if (!paymentUrl) {
      return res.status(500).json({ error: 'no payment url from PhonePe', raw: phonepeResp.data });
    }

    // save paymentUrl in order record
    // updateOrder(orderId, { paymentUrl });

    // send SMS with link
    await twilio.messages.create({
      body: `Pay ₹${amount} for Phymate: ${paymentUrl}`,
      from: TWILIO_FROM,
      to: buyerPhone
    });

    return res.json({ ok:true, orderId, paymentUrl });
  } catch (err) {
    console.error(err?.response?.data || err.message);
    return res.status(500).json({ error: err?.response?.data || err.message });
  }
});

// webhook callback endpoint
app.post('/phonepe-callback', (req, res) => {
  // validate signature/X-VERIFY or basic auth per PhonePe docs
  const body = req.body;
  console.log('phonepe webhook', body);
  // verify using your MERCHANT_SALT and scheme from docs
  // lookup order by body.transactionId and mark paid after verification
  res.status(200).send('OK');
});

app.listen(process.env.PORT||3000, ()=>console.log('listening'));
