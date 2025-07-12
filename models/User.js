const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  account: { type: String, default: '' },
  rangeMin: { type: Number, default: 4000 },
  rangeMax: { type: Number, default: 10000 },
  frequencyHours: { type: Number, default: 48 },
  lastRequestAt: { type: Date, default: null },
  lastAmount: { type: Number, default: null },
  verified: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
});

module.exports = mongoose.model('User', userSchema);
