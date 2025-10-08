import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import bodyParser from "body-parser";

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// Generate unique transaction ID
function generateTxnId() {
  return "PHY" + Date.now();
}

// Create payment order
app.post("/create-order", async (req, res) => {
  const txnId = generateTxnId();
  const amount = req.body.amount || 10000; // amount in paise (₹100)
  const payload = {
    merchantId: process.env.MERCHANT_ID,
    merchantTransactionId: txnId,
    amount: amount,
    redirectUrl: process.env.REDIRECT_URL,
    redirectMode: "REDIRECT",
    callbackUrl: process.env.CALLBACK_URL,
    paymentInstrument: {
      type: "PAY_PAGE"
    }
  };

  const data = Buffer.from(JSON.stringify(payload)).toString("base64");
  const checksum = crypto
    .createHash("sha256")
    .update(data + "/pg/v1/pay" + process.env.SALT_KEY)
    .digest("hex") + "###" + process.env.SALT_INDEX;

  try {
    const response = await axios.post(process.env.PHONEPE_BASE_URL, {
      request: data
    }, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum
      }
    });

    const payUrl = response.data.data.instrumentResponse.redirectInfo.url;
    return res.redirect(payUrl);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("Payment creation failed");
  }
});

// Callback handler (PhonePe notifies payment result)
app.post("/payment-callback", (req, res) => {
  console.log("Callback received:", req.body);
  // Verify hash and update database/order here
  res.status(200).send("OK");
});

// Success redirect (user lands here after payment)
app.get("/payment-status", (req, res) => {
  res.send("Payment complete. You can now close this page.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
