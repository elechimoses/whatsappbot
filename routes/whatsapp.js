const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { extractTextFromImage, verifyReceiptText } = require('../utils/ocr');

router.post('/webhook', async (req, res) => {
  const msg = req.body.Body?.trim().toUpperCase();
  const phone = req.body.From?.replace('whatsapp:', '');
  const mediaUrl = req.body.MediaUrl0;

  let user = await User.findOne({ phone });

  // New user flow
  if (!user) {
    user = await User.create({ phone });
    return res.send(`<Response><Message>Welcome! Please type "START" to activate.</Message></Response>`);
  }

  // Start/verify user
  if (msg === 'START') {
    user.verified = true;
    await user.save();
    return res.send(`<Response><Message>You're verified. Send your bank account like: GTBank 1234567890</Message></Response>`);
  }

  // Pause/resume
  if (msg === 'PAUSE') {
    user.status = 'paused';
    await user.save();
    return res.send(`<Response><Message>Paused. You won’t receive any new requests.</Message></Response>`);
  }

  if (msg === 'RESUME') {
    user.status = 'active';
    await user.save();
    return res.send(`<Response><Message>Resumed. You will receive requests again.</Message></Response>`);
  }

  if (!user.verified) {
    return res.send(`<Response><Message>Please type "START" to verify and begin.</Message></Response>`);
  }

  if (msg.match(/\d{10}/)) {
    user.account = msg;
    await user.save();
    return res.send(`<Response><Message>Account saved! I’ll now start asking for help based on your settings.</Message></Response>`);
  }

  // Handle receipt upload
  if (mediaUrl) {
    const imagePath = `./data/receipt-${user.phone}.jpg`;
    const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
    const fs = require('fs');
    fs.writeFileSync(imagePath, response.data);

    const text = await extractTextFromImage(imagePath);

    const lastTx = await Transaction.findOne({ user: user._id, status: 'pending' }).sort({ createdAt: -1 });

    const isValid = verifyReceiptText(text, lastTx.amount, user.account.split(' ')[1]);

    if (!lastTx) {
    return res.send(`<Response><Message>No pending transaction found.</Message></Response>`);
    }

    if (isValid) {
        lastTx.status = 'verified';
        lastTx.receiptPath = imagePath;
        await lastTx.save();
        user.lastAmount = null;
        await user.save();
        return res.send(`<Response><Message>✅ Receipt verified. Thanks!</Message></Response>`);
    } else {
        lastTx.status = 'failed';
        await lastTx.save();
        return res.send(`<Response><Message>❌ Couldn’t verify your receipt. Please check the details.</Message></Response>`);
    }
  }

  return res.send(`<Response><Message>Send receipt or use commands: START, PAUSE, RESUME.</Message></Response>`);
});

module.exports = router;
