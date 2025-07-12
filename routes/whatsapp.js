const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { extractTextFromImage, verifyReceiptText } = require('../utils/ocr');

router.post('/webhook', async (req, res) => {
  const msg = req.body.Body?.trim().toUpperCase();
  const originalText = req.body.Body?.trim(); // Keep original for parsing
  const phone = req.body.From?.replace('whatsapp:', '');
  const mediaUrl = req.body.MediaUrl0;

  let user = await User.findOne({ phone });

  // New user flow - warm welcome
  if (!user) {
    user = await User.create({ phone, setupStep: 'welcome' });
    return res.send(`<Response><Message>
🌟 *Welcome to FundMe!*

I help you request financial assistance from your network in a respectful, organized way.

Ready to get started? Just reply with *START* 🚀
    </Message></Response>`);
  }

  // Start verification flow
  if (msg === 'START') {
    if (!user.verified) {
      user.verified = true;
      user.setupStep = 'account';
      await user.save();

      return res.send(`<Response><Message>
🎉 *Great! Let's set you up in 3 easy steps:*

*Step 1 of 3: Your Bank Account* 🏦
Please send your bank details in this format:
👉 *BankName AccountNumber*

Example: *GTBank 1234567890*

This helps people know where to send help.
      </Message></Response>`);
    } else {
      return res.send(`<Response><Message>✅ You're already verified! Type *HELP* to see available commands.</Message></Response>`);
    }
  }

  // Quick help command
  if (msg === 'HELP') {
    if (!user.verified) {
      return res.send(`<Response><Message>Type *START* to begin setup! 🚀</Message></Response>`);
    }

    return res.send(`<Response><Message>
📋 *Available Commands:*

⚙️ *SETTINGS* - View your current setup
✏️ *EDIT* - Change your settings
⏸️ *PAUSE* - Stop receiving requests
▶️ *RESUME* - Resume receiving requests
📊 *STATUS* - Check your account status

Need help? Just ask! 😊
    </Message></Response>`);
  }

  // Pause/resume with better messaging
  if (msg === 'PAUSE') {
    user.status = 'paused';
    await user.save();
    return res.send(`<Response><Message>
⏸️ *Paused Successfully*

You won't receive any new funding requests until you resume.

Type *RESUME* when you're ready to continue.
    </Message></Response>`);
  }

  if (msg === 'RESUME') {
    user.status = 'active';
    await user.save();
    return res.send(`<Response><Message>
▶️ *Resumed Successfully*

You'll start receiving funding requests again based on your settings.

Type *SETTINGS* to review your current setup.
    </Message></Response>`);
  }

  // Ensure user is verified for all other actions
  if (!user.verified) {
    return res.send(`<Response><Message>
👋 Please type *START* to verify and begin setup.

Don't worry, it only takes a minute! 😊
    </Message></Response>`);
  }

  // Step-by-step setup flow
  if (user.setupStep === 'account' && msg.match(/\w+\s+\d{10}/)) {
    user.account = originalText;
    user.setupStep = 'frequency';
    await user.save();
    
    return res.send(`<Response><Message>
✅ *Bank account saved!*

*Step 2 of 3: Request Frequency* ⏰
How often should I send requests for help?

Send a number of hours:
👉 *24* (every day)
👉 *48* (every 2 days)  
👉 *72* (every 3 days)

Choose what feels comfortable for you.
    </Message></Response>`);
  }

  // Handle frequency setting during setup
  if (user.setupStep === 'frequency' && msg.match(/^\d{1,3}$/)) {
    const hours = parseInt(msg);
    if (hours > 0 && hours <= 168) { // Max 1 week
      user.frequencyHours = hours;
      user.setupStep = 'range';
      await user.save();

      return res.send(`<Response><Message>
✅ *Frequency set to every ${hours} hours*

*Step 3 of 3: Amount Range* 💰
What's your preferred assistance range?

Send two amounts separated by a space:
👉 *3000 8000* (between ₦3,000 and ₦8,000)
👉 *5000 15000* (between ₦5,000 and ₦15,000)

Choose amounts that work for your network.
      </Message></Response>`);
    } else {
      return res.send(`<Response><Message>
❌ Please enter a valid number of hours (1-168).

Example: *48* for every 2 days
      </Message></Response>`);
    }
  }

  // Handle range setting during setup
  if (user.setupStep === 'range' && msg.match(/^\d+\s+\d+$/)) {
    const [minStr, maxStr] = msg.split(/\s+/);
    const rangeMin = parseInt(minStr);
    const rangeMax = parseInt(maxStr);

    if (rangeMin > 0 && rangeMax > rangeMin && rangeMax <= 1000000) {
      user.rangeMin = rangeMin;
      user.rangeMax = rangeMax;
      user.setupStep = 'complete';
      user.status = 'active';
      await user.save();

      return res.send(`<Response><Message>
🎉 *Setup Complete!*

✅ Account: ${user.account}
✅ Frequency: Every ${user.frequencyHours} hours
✅ Range: ₦${rangeMin.toLocaleString()} – ₦${rangeMax.toLocaleString()}

You're all set! I'll start sending respectful requests to your network.

Type *HELP* to see available commands.
      </Message></Response>`);
    } else {
      return res.send(`<Response><Message>
❌ Please enter valid amounts where the second is larger than the first.

Example: *3000 8000*
      </Message></Response>`);
    }
  }

  // Advanced settings commands (after setup)
  if (msg === 'SETTINGS' || msg === 'SHOW SETTINGS') {
    return res.send(`<Response><Message>
📋 *Your Current Settings:*

🏦 Account: ${user.account || 'Not set'}
💰 Range: ₦${user.rangeMin?.toLocaleString() || 'Not set'} – ₦${user.rangeMax?.toLocaleString() || 'Not set'}
⏱ Frequency: Every ${user.frequencyHours || 'Not set'} hours
📡 Status: ${user.status || 'Not set'}

Want to change something? Type *EDIT* 📝
    </Message></Response>`);
  }

  if (msg === 'EDIT') {
    return res.send(`<Response><Message>
✏️ *Edit Your Settings:*

🏦 *EDIT ACCOUNT BankName 1234567890*
⏱ *EDIT FREQUENCY 48*
💰 *EDIT RANGE 3000 8000*

Example: *EDIT FREQUENCY 24*
    </Message></Response>`);
  }

  // Handle edit commands
  if (msg.startsWith('EDIT ACCOUNT')) {
    const accountMatch = originalText.match(/EDIT ACCOUNT\s+(.+)/i);
    if (accountMatch && accountMatch[1].match(/\w+\s+\d{10}/)) {
      user.account = accountMatch[1];
      await user.save();
      return res.send(`<Response><Message>✅ Account updated to: ${user.account}</Message></Response>`);
    }
    return res.send(`<Response><Message>❌ Format: *EDIT ACCOUNT BankName 1234567890*</Message></Response>`);
  }

  if (msg.startsWith('EDIT FREQUENCY')) {
    const freqMatch = originalText.match(/EDIT FREQUENCY\s+(\d+)/i);
    if (freqMatch) {
      const hours = parseInt(freqMatch[1]);
      if (hours > 0 && hours <= 168) {
        user.frequencyHours = hours;
        await user.save();
        return res.send(`<Response><Message>✅ Frequency updated to every ${hours} hours</Message></Response>`);
      }
    }
    return res.send(`<Response><Message>❌ Format: *EDIT FREQUENCY 24*</Message></Response>`);
  }

  if (msg.startsWith('EDIT RANGE')) {
    const rangeMatch = originalText.match(/EDIT RANGE\s+(\d+)\s+(\d+)/i);
    if (rangeMatch) {
      const rangeMin = parseInt(rangeMatch[1]);
      const rangeMax = parseInt(rangeMatch[2]);
      if (rangeMin > 0 && rangeMax > rangeMin && rangeMax <= 1000000) {
        user.rangeMin = rangeMin;
        user.rangeMax = rangeMax;
        await user.save();
        return res.send(`<Response><Message>✅ Range updated to ₦${rangeMin.toLocaleString()} – ₦${rangeMax.toLocaleString()}</Message></Response>`);
      }
    }
    return res.send(`<Response><Message>❌ Format: *EDIT RANGE 3000 8000*</Message></Response>`);
  }

  // Check if setup is complete before processing other actions
  if (!user.account || !user.rangeMin || !user.rangeMax || !user.frequencyHours) {
    let nextStep = '';
    if (!user.account) nextStep = 'Send your bank account: *BankName 1234567890*';
    else if (!user.frequencyHours) nextStep = 'Send frequency in hours: *48*';
    else if (!user.rangeMin || !user.rangeMax) nextStep = 'Send amount range: *3000 8000*';

    return res.send(`<Response><Message>
⚠️ *Setup incomplete*

Next step: ${nextStep}

Type *HELP* if you need assistance! 😊
    </Message></Response>`);
  }

  // Handle receipt upload
  if (mediaUrl) {
    const imagePath = `./data/receipt-${user.phone}.jpg`;
    const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
    const fs = require('fs');
    fs.writeFileSync(imagePath, response.data);

    const text = await extractTextFromImage(imagePath);
    const lastTx = await Transaction.findOne({ user: user._id, status: 'pending' }).sort({ createdAt: -1 });

    if (!lastTx) {
      return res.send(`<Response><Message>
❌ No pending transaction found.

If you believe this is an error, please contact support.
      </Message></Response>`);
    }

    const isValid = verifyReceiptText(text, lastTx.amount, user.account.split(' ')[1]);

    if (isValid) {
      lastTx.status = 'verified';
      lastTx.receiptPath = imagePath;
      await lastTx.save();
      user.lastAmount = null;
      await user.save();
      
      return res.send(`<Response><Message>
✅ *Receipt Verified!*

Thank you for the confirmation. Your transaction has been recorded.

🙏 We appreciate your transparency!
      </Message></Response>`);
    } else {
      lastTx.status = 'failed';
      await lastTx.save();
      
      return res.send(`<Response><Message>
❌ *Receipt verification failed*

Please ensure:
• The amount matches your request
• Your account number is visible
• The image is clear and readable

Try uploading again or contact support if issues persist.
      </Message></Response>`);
    }
  }

  // Default response for unrecognized commands
  return res.send(`<Response><Message>
🤔 I didn't understand that command.

Type *HELP* to see available options or send a receipt image to verify a transaction.
  </Message></Response>`);
});

module.exports = router;
