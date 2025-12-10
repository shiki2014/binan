const mathUtils = require('./mathUtils');
const precisionUtils = require('./precisionUtils');
const timeUtils = require('./timeUtils');
const formatUtils = require('./formatUtils');
const validationUtils = require('./validationUtils');
module.exports = {
  ...mathUtils,
  ...timeUtils,
  ...formatUtils,
  ...precisionUtils,
  ...validationUtils
};