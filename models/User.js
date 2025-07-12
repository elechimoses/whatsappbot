const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  account: { type: String, default: '' },
  rangeMin: { type: Number, default: null },
  rangeMax: { type: Number, default: null },
  frequencyHours: { type: Number, default: null },
  lastRequestAt: { type: Date, default: null },
  lastAmount: { type: Number, default: null },
  verified: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'paused'], default: 'active' },
});

module.exports = mongoose.model('User', userSchema);
