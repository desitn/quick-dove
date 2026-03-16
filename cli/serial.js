const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { loadToolsConfig } = require('./utils');

/**
 * 列出所有串口设备
 */
async function listSerialPorts() {
    try {
        const ports = await SerialPort.list();
        return ports.map(port => {
            // 组合描述信息用于识别
            const fullDesc = [
                port.pnpId || '',
                port.manufacturer || '',
                port.friendlyName || ''
            ].join(' ').trim();
            
            return {
                path: port.path,
                manufacturer: port.manufacturer || 'Unknown',
                serialNumber: port.serialNumber || 'N/A',
                pnpId: port.pnpId || 'N/A',
                locationId: port.locationId || 'N/A',
                vendorId: port.vendorId ? `0x${port.vendorId}` : 'N/A',
                productId: port.productId ? `0x${port.productId}` : 'N/A',
                fullDescription: fullDesc  // 完整描述用于识别
            };
        });
    } catch (error) {
        console.error('列出串口失败:', error.message);
        return [];
    }
}

/**
 * 获取平台下载端口配置
 * @param {string} platform - 平台类型
 */
function getDownloadPortConfig(platform) {
    const config = loadToolsConfig();
    const platformConfig = config.platforms?.[platform];
    return platformConfig?.serial || null;
}

/**
 * 查找下载端口
 * 根据平台配置的描述符特征识别下载模式端口
 * 支持串口设备和总线设备（USB Mass Storage等）
 * @param {string} platform - 平台类型（可选，用于获取平台特定配置）
 */
async function findDownloadPort(platform = null) {
    try {
        // 1. 首先检查串口设备
        const ports = await SerialPort.list();
        
        // 获取平台配置
        const serialConfig = platform ? getDownloadPortConfig(platform) : null;
        // 使用平台配置或默认配置
        const patterns = serialConfig?.downloadPortPatterns || ['download'];
        const vidPidList = serialConfig?.downloadPortVidPid || [];
        
        for (const port of ports) {
            // 组合所有描述字段
            const descriptions = [
                port.pnpId || '',
                port.manufacturer || '',
                port.friendlyName || ''
            ].join(' ').toLowerCase();
            
            // 检测下载端口特征（从配置读取）
            let isDownloadPort = false;
            
            // 检查描述符模式
            for (const pattern of patterns) {
                if (descriptions.includes(pattern.toLowerCase())) {
                    isDownloadPort = true;
                    break;
                }
            }
            
            // 检查 VID/PID（如果配置了）
            if (!isDownloadPort && vidPidList && vidPidList.length > 0) {
                for (const { vid, pid } of vidPidList) {
                    if (port.vendorId?.toLowerCase() === vid.toLowerCase() && 
                        port.productId?.toLowerCase() === pid.toLowerCase()) {
                        isDownloadPort = true;
                        break;
                    }
                }
            }
            
            if (isDownloadPort) {
                return {
                    path: port.path,
                    description: (port.pnpId || port.manufacturer || 'Download Port').trim(),
                    vendorId: port.vendorId,
                    productId: port.productId,
                    type: 'serial'
                };
            }
        }
        
        // 2. 检查总线设备（USB Mass Storage等）
        const busDevice = await findDownloadBusDevice(platform);
        if (busDevice) {
            return busDevice;
        }
        
        return null;
    } catch (error) {
        console.error('查找下载端口失败:', error.message);
        return null;
    }
}

/**
 * 查找下载总线设备（USB Mass Storage等）
 * 复用 flash.js 中的 listDevices 逻辑
 * @param {string} platform - 平台类型
 */
async function findDownloadBusDevice(platform = null) {
    if (!isWindows()) {
        return null;
    }
    
    try {
        // 获取平台配置
        const serialConfig = platform ? getDownloadPortConfig(platform) : null;
        const busVidPidList = serialConfig?.downloadBusVidPid || [];
        const patterns = serialConfig?.downloadPortPatterns || ['download'];
        
        // 复用已有的设备列表逻辑（通过 execCommand 执行 wmic）
        const { execSync } = require('child_process');
        const command = 'wmic path Win32_PnPEntity where "Name like \'%USB%\' OR Name like \'%Quectel%\'" get Name';
        const output = execSync(command, { encoding: 'utf8', timeout: 5000 });
        
        const lines = output.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.includes('Name')) continue;
            
            const lowerLine = trimmedLine.toLowerCase();
            
            // 1. 先检查描述符模式（如 "download"）
            for (const pattern of patterns) {
                if (lowerLine.includes(pattern.toLowerCase())) {
                    return {
                        path: 'BUS',
                        description: trimmedLine,
                        vendorId: null,
                        productId: null,
                        type: 'bus'
                    };
                }
            }
            
            // 2. 检查 VID/PID（如果配置了）
            for (const { vid, pid } of busVidPidList) {
                const vidPattern = vid.toUpperCase();
                const pidPattern = pid.toUpperCase();
                
                // 在设备描述中查找 VID/PID
                if (trimmedLine.toUpperCase().includes(vidPattern) && 
                    trimmedLine.toUpperCase().includes(pidPattern)) {
                    return {
                        path: 'BUS',
                        description: trimmedLine,
                        vendorId: vid,
                        productId: pid,
                        type: 'bus'
                    };
                }
            }
        }
        
        return null;
    } catch (error) {
        // 静默失败，不影响主流程
        return null;
    }
}

/**
 * 检查是否为Windows系统
 */
function isWindows() {
    return process.platform === 'win32';
}

/**
 * 查找 AT 端口
 * 根据平台配置的描述符特征识别 AT 端口
 * @param {string} platform - 平台类型（可选，用于获取平台特定配置）
 */
async function findATPort(platform = null) {
    try {
        const ports = await SerialPort.list();
        
        // 获取平台配置
        const serialConfig = platform ? getDownloadPortConfig(platform) : null;
        
        // 使用平台配置或默认配置
        const patterns = serialConfig?.atPortPatterns || ['at port', 'modem'];
        
        let atPort = null;
        let fallbackPort = null;
        
        for (const port of ports) {
            // 组合所有可能的描述字段
            const descriptions = [
                port.pnpId || '',
                port.manufacturer || '',
                port.friendlyName || ''
            ].join(' ').toLowerCase();
            
            // 根据配置的模式查找 AT 端口
            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i].toLowerCase();
                if (descriptions.includes(pattern)) {
                    const portInfo = {
                        path: port.path,
                        description: (port.pnpId || port.manufacturer || 'AT Port').trim(),
                        vendorId: port.vendorId,
                        productId: port.productId
                    };
                    
                    // 第一个模式优先级最高（通常是 "at port"）
                    if (i === 0) {
                        atPort = portInfo;
                        break;
                    } else if (!fallbackPort) {
                        fallbackPort = portInfo;
                    }
                }
            }
            
            if (atPort) break; // 找到优先级最高的端口立即返回
        }
        
        return atPort || fallbackPort;
    } catch (error) {
        console.error('查找 AT 端口失败:', error.message);
        return null;
    }
}

/**
 * 打开串口
 */
function openSerialPort(path, baudRate = 115200) {
    return new Promise((resolve, reject) => {
        const port = new SerialPort({
            path: path,
            baudRate: baudRate,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            autoOpen: false
        });
        
        port.open((err) => {
            if (err) {
                reject(new Error(`无法打开串口 ${path}: ${err.message}`));
            } else {
                resolve(port);
            }
        });
    });
}

/**
 * 发送 AT 命令并等待响应
 */
async function sendATCommand(portPath, command, timeout = 2000) {
    const port = await openSerialPort(portPath);
    
    return new Promise((resolve, reject) => {
        let response = '';
        let timeoutId;
        
        // 创建解析器
        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        
        // 监听数据
        parser.on('data', (line) => {
            response += line + '\n';
            
            // 检查是否收到 OK 或 ERROR
            if (line.includes('OK')) {
                clearTimeout(timeoutId);
                port.close(() => {
                    resolve({ success: true, response: response.trim() });
                });
            } else if (line.includes('ERROR')) {
                clearTimeout(timeoutId);
                port.close(() => {
                    resolve({ success: false, response: response.trim() });
                });
            }
        });
        
        // 设置超时
        timeoutId = setTimeout(() => {
            port.close(() => {
                // 超时但可能是正常的（模块重启进入下载模式）
                resolve({ success: null, response: response.trim(), timeout: true });
            });
        }, timeout);
        
        // 发送命令
        port.write(command + '\r\n', (err) => {
            if (err) {
                clearTimeout(timeoutId);
                port.close(() => {
                    reject(new Error(`发送命令失败: ${err.message}`));
                });
            }
        });
        
        // 处理错误
        port.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(new Error(`串口错误: ${err.message}`));
        });
    });
}

/**
 * 从平台配置获取串口设置
 */
function getPlatformSerialConfig(platform) {
    const config = loadToolsConfig();
    const platformConfig = config.platforms?.[platform];
    return platformConfig?.serial || null;
}

/**
 * 进入下载模式
 * @param {string} platform - 平台类型 (asr160x, asr1x03, unisoc, eigen)
 * @param {boolean} force - 是否强制下载
 * @param {number} timeout - 超时时间（秒）
 */
async function enterDownloadMode(platform = 'asr160x', force = false, timeout = 2) {
    console.log('🔌 进入下载模式工具');
    console.log('='.repeat(50));
    console.log(`平台: ${platform}, 强制: ${force}, 超时: ${timeout}s`);
    
    // 1. 获取平台串口配置
    const serialConfig = getPlatformSerialConfig(platform);
    if (!serialConfig) {
        console.log(`⚠️ 平台 ${platform} 未配置串口参数，跳过进入下载模式`);
        return { success: true, skipped: true, reason: '未配置串口参数' };
    }
    
    // 2. 检查是否已在下载模式（使用平台配置）
    const dlPort = await findDownloadPort(platform);
    if (dlPort) {
        console.log(`✅ 设备已在下载模式: ${dlPort.path}`);
        console.log(`   描述: ${dlPort.description}`);
        return { success: true, port: dlPort.path, alreadyInMode: true };
    }
    
    // 3. 查找 AT 端口（使用平台配置）
    console.log('🔍 查找 AT 端口...');
    const atPort = await findATPort(platform);
    if (!atPort) {
        console.error('❌ 未找到 AT 端口');
        return { success: false, error: '未找到 AT 端口' };
    }
    
    console.log(`✅ 找到 AT 端口: ${atPort.path}`);
    console.log(`   描述: ${atPort.description}`);
    
    // 4. 获取 AT 命令
    let atCommand = serialConfig.atCommand;
    if (force && serialConfig.atCommandForce) {
        atCommand = serialConfig.atCommandForce;
    }
    
    console.log(`📤 发送命令: ${atCommand}`);
    
    // 5. 发送 AT 命令
    try {
        const result = await sendATCommand(atPort.path, atCommand, timeout * 1000);
        
        console.log(`📥 响应:\n${result.response}`);
        
        if (result.success === true) {
            console.log('✅ 命令执行成功');
        } else if (result.success === false) {
            console.log('❌ 命令执行失败');
            return { success: false, error: 'AT 命令返回 ERROR' };
        } else if (result.timeout) {
            console.log('⏱️ 等待响应超时：可能模块正在重启');
        }
        
        // 6. 检查是否进入下载模式
        console.log('🔍 检查下载端口...');
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const newDlPort = await findDownloadPort();
            if (newDlPort) {
                console.log(`✅ 成功进入下载模式: ${newDlPort.path}`);
                return { success: true, port: newDlPort.path };
            }
            console.log(`   检查 ${i + 1}/10...`);
        }
        
        console.error('❌ 未能检测到下载端口');
        return { success: false, error: '未能检测到下载端口' };
        
    } catch (error) {
        console.error('❌ 发送命令失败:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * 显示串口列表
 */
async function showSerialList() {
    console.log('🔌 串口设备列表');
    console.log('='.repeat(70));
    
    const ports = await listSerialPorts();
    
    if (ports.length === 0) {
        console.log('⚠️ 未找到串口设备');
        return;
    }
    
    console.log(`找到 ${ports.length} 个串口设备:\n`);
    
    ports.forEach((port, index) => {
        console.log(`${index + 1}. ${port.path}`);
        console.log(`   制造商: ${port.manufacturer}`);
        console.log(`   VID: ${port.vendorId}, PID: ${port.productId}`);
        console.log(`   描述: ${port.fullDescription.substring(0, 100)}`);
        console.log('-'.repeat(70));
    });
}

module.exports = {
    listSerialPorts,
    findDownloadPort,
    findATPort,
    sendATCommand,
    enterDownloadMode,
    showSerialList
};
