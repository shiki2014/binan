// 获取数值的精度
function getPrecision(number) {
  var strNumber = number.toString();
  if (strNumber.indexOf('.') !== -1) {
      var decimalPart = strNumber.split('.')[1];
      return decimalPart.length;
  } else {
      return 0;
  }
}

// 保留固定位小数，不进行四舍五入
function truncateDecimal(number, decimalPlaces) {
  // 将数值转换为字符串
  var numberString = number.toString();
  // 检查是否包含小数点
  var decimalIndex = numberString.indexOf('.');
  if (decimalIndex !== -1) {
      // 获取小数部分的字符串
      var decimalPart = numberString.substring(decimalIndex + 1, decimalIndex + 1 + decimalPlaces);
      // 拼接整数和截断后的小数部分
      return parseFloat(numberString.substring(0, decimalIndex + 1 + decimalPlaces));
  } else {
      // 如果没有小数点，返回原始数值
      return number;
  }
}

module.exports = {
  getPrecision,
  truncateDecimal
}