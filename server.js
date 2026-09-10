require("dotenv").config();

const mongoose = require('mongoose');
const createApp = require('./app');

const DB_PATH = process.env.MONGO_URI;
const PORT = process.env.PORT || 3006;

const app = createApp();

mongoose.connect(DB_PATH)
  .then(() => {
    console.log('✅ Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.log('❌ Error while connecting to MongoDB:', err);
  });
