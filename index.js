require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const whatsappRoutes = require('./routes/whatsapp');

mongoose.connect(process.env.MONGO_URI).then(() => console.log('MongoDB connected'));

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/whatsapp', whatsappRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
