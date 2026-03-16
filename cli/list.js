const fs = require('fs');
const path = require('path');
const { 
    findAllFirmwares,
    formatSize
} = require('./utils');

/**
 * 列出可用固件
 */
async function listFirmware() {
    // 使用统一的固件查找逻辑
    const firmwares = findAllFirmwares();
    
    if (firmwares.length === 0) {
        console.log('未找到固件文件');
        console.log('提示: 配置.firmware-cli.json文件或使用flash <路径>命令指定固件');
        return [];
    }
    
    console.log(`找到 ${firmwares.length} 个固件:`);
    firmwares.forEach((fw, index) => {
        console.log(`${index + 1}. ${fw.name}`);
        console.log(`   路径: ${fw.path}`);
        console.log(`   类型: ${fw.type}`);
        console.log(`   大小: ${formatSize(fw.size)}`);
        console.log(`   时间: ${fw.time}`);
        console.log();
    });
    
    // 推荐最新的固件
    // 排序规则：优先选择不带 "factory" 的包，然后按时间倒序
    const sortedFirmwares = firmwares.sort((a, b) => {
        const aIsFactory = a.name.toLowerCase().includes('factory');
        const bIsFactory = b.name.toLowerCase().includes('factory');
        
        // 如果一个是 factory 一个不是，非 factory 优先
        if (aIsFactory && !bIsFactory) return 1;
        if (!aIsFactory && bIsFactory) return -1;
        
        // 否则按时间倒序
        return b.mtime - a.mtime;
    });
    
    const latest = sortedFirmwares[0];
    console.log(`推荐固件: ${latest.name}`);
    console.log(`烧录命令: firmware-cli.exe flash "${latest.path}"`);
    
    return firmwares;
}

module.exports = {
    listFirmware
};
