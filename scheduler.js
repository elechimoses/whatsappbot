require('dotenv').config();
const cron = require('node-cron');
const mongoose = require('mongoose');
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const { generateRequestMessage } = require('./utils/gpt');
const axios = require('axios');

mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log('MongoDB connected for scheduler');
});

cron.schedule('0 * * * *', async () => {
  const now = new Date();

  const users = await User.find({ verified: true, status: 'active' });

  for (const user of users) {
    const nextRequestTime = user.lastRequestAt
      ? new Date(user.lastRequestAt.getTime() + user.frequencyHours * 60 * 60 * 1000)
      : null;

    if (!nextRequestTime || now >= nextRequestTime) {
      const amount = Math.floor(Math.random() * (user.rangeMax - user.rangeMin + 1)) + user.rangeMin;
      const message = await generateRequestMessage(amount);

     try {
            await axios.post(
                `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
                new URLSearchParams({
                From: 'whatsapp:+14155238886',
                To: `whatsapp:${user.phone}`,
                Body: `${message}\nSend to: ${user.account}`,
                }),
                {
                auth: {
                    username: process.env.TWILIO_SID,
                    password: process.env.TWILIO_AUTH,
                },
                }
            );

            await Transaction.create({
                user: user._id,
                amount,
                message,
                status: 'pending',
            });

            user.lastAmount = amount;
            user.lastRequestAt = now;
            await user.save();
            } catch (error) {
            console.error(`❌ Failed to send message to ${user.phone}:`, error.message);
        }

    }
  }

});
console.log('Scheduler running every hour to send requests');