const sharp = require('sharp');
const fs = require('fs');

sharp('icon.svg')
  .png()
  .resize(128, 128)
  .toFile('icon.png')
  .then(() => console.log('图标转换成功！'))
  .catch(err => console.error('转换失败:', err));
