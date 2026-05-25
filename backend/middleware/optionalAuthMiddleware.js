const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/jwt');
const { findUserById } = require('../models/userModel');

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, jwtSecret);
    const user = await findUserById(decoded.id);

    if (user) {
      req.user = user;
    }

    return next();
  } catch (error) {
    return next();
  }
};

module.exports = optionalAuth;
