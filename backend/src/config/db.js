const mongoose = require('mongoose');
const config = require('./env');
const { dbLogger } = require('./logger');

mongoose.set('strictQuery', true);

async function connectDB() {
  try {
    mongoose.connection.on('connected', () => {
      dbLogger.info('MongoDB connection established');
    });

    mongoose.connection.on('error', (err) => {
      dbLogger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      dbLogger.warn('MongoDB disconnected');
    });

    await mongoose.connect(config.mongo.uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10000,
    });
  } catch (err) {
    dbLogger.fatal({ err }, 'Failed to connect to MongoDB. Exiting process.');
    process.exit(1);
  }
}

async function disconnectDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB };