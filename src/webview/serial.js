/**
 * Quick Serial Debug Tool for VSCode Extension
 * Implements serial communication functionality within a WebView
 * Communicates with backend for actual serial operations
 */

// 获取VS Code API实例，确保只获取一次
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

const SerialDebug = {
    isOpen: false,
    currentTheme: 'dark',    // 默认主题
    isAutomationMode: false, // 自动化模式状态
    
    // 自动化执行相关属性
    automation: {
        commands: [], // 自动化命令序列
        isRunning: false,
        isPaused: false,
        currentStep: 0,
        loopCount: 0,
        totalLoops: 1,
        startTime: null,
        timer: null,
        shouldShow:false,
    },
    
    // 初始化串口调试界面
    init: function() {
 
        if (vscode) {
            vscode.postMessage({
                command: 'loadAtConfigList'
            });
        }

        this.setupEventListeners();
        
        this.requestPorts();
        
        this.initAutomation();
    },
    
    // 设置事件监听器
    setupEventListeners: function() {
        document.getElementById('connectBtn').addEventListener('click', () => this.toggleConnection());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendData());
        document.getElementById('clearLogBtn').addEventListener('click', () => this.clearLog());
        document.getElementById('saveLogBtn').addEventListener('click', () => this.saveLog());
        document.getElementById('portSelector').addEventListener('focus', () => this.requestPorts());
        document.getElementById('themeToggleBtn').addEventListener('click', () => this.toggleTheme());
        document.getElementById('panelModeToggleBtn').addEventListener('click', () => this.togglePanelMode());
        document.getElementById('automationModeToggleBtn').addEventListener('click', () => this.toggleAutomationMode());
        document.getElementById('captureAutomationBtn').addEventListener('click', () => this.toggleAllCommandConfigs());
        document.getElementById('dtrCheckbox').addEventListener('change', (e) => {
            if (this.isOpen && vscode) {
                vscode.postMessage({
                    command: 'setDTR',
                    state: e.target.checked
                });
            }
        });
        document.getElementById('rtsCheckbox').addEventListener('change', (e) => {
            if (this.isOpen && vscode) {
                vscode.postMessage({
                    command: 'setRTS',
                    state: e.target.checked
                });
            }
        });
        
        // 添加日志搜索功能
        document.getElementById('logSearchBtn').addEventListener('click', () => this.performLogSearch());
        document.getElementById('logSearchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performLogSearch();
            }
        });
        document.getElementById('logClearSearchBtn').addEventListener('click', () => {
            document.getElementById('logSearchInput').value = '';
            this.performLogSearch();
        });
        
        // 添加正则模式复选框的事件监听
        document.getElementById('regexModeCheckbox').addEventListener('change', () => {
            this.performLogSearch();
        });
        
        // 添加鼠标滚轮事件监听器到标签容器
        const tabsContainer = document.getElementById('atConfigTabs');
        tabsContainer.addEventListener('wheel', (e) => {
            e.preventDefault(); // 阻止默认滚动行为
            tabsContainer.scrollLeft += e.deltaY;
        });

        // 添加添加AT命令标签按钮事件监听
        const addTabButton = document.getElementById('addAtCommandTab');
        if (addTabButton) {
            addTabButton.addEventListener('click', () => this.addNewAtCommandTab());
        }

        // Enter键发送数据
        document.getElementById('sendText').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendData();
            }
        });
        
        // AT命点击发送
        document.getElementById('atCommandsList').addEventListener('click', (e) => {
            if (e.target.classList.contains('send-at-cmd-icon') || ( e.target.closest('.send-at-cmd-icon'))) {
                const button = e.target.closest('.send-at-cmd-icon');
                const command = button.dataset.command;
                document.getElementById('sendText').value = command;
                this.sendData();
            } else if (e.target.tagName === 'SPAN' 
                && e.target.parentElement.classList.contains('at-command-item')) {
                this.editAtCommand(e.target);
            } else  if (e.target.classList.contains('add-at-cmd-icon') || ( e.target.closest('.add-at-cmd-icon'))) {
                const button = e.target.closest('.add-at-cmd-icon');
                const command = button.dataset.command;
                if (this.isAutomationMode) {
                    this.addCommandToAutomationTrack(command);
                }
            }

        });
        
        // 为AT命令输入框添加回车和失去焦点事件
        document.getElementById('atCommandsList').addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' && e.key === 'Enter') {
                this.saveAtCommand(e.target);
            }
        });
        
        // 为AT命令输入框添加失去焦点事件，当用户点击其他地方时保存更改
        document.getElementById('atCommandsList').addEventListener('blur', (e) => {
            if (e.target.tagName === 'INPUT') {
                this.saveAtCommand(e.target);
            }
        }, true); // 使用捕获阶段确保能够正确监听到事件
        
        // 添加自动化相关的事件监听
        this.setupAutomationEventListeners();
    },

    /**
     * 执行日志搜索和过滤
     */
    performLogSearch: function() {
        const searchTerm = document.getElementById('logSearchInput').value;
        const useRegex = document.getElementById('regexModeCheckbox') ? document.getElementById('regexModeCheckbox').checked : false;
        const logEntries = document.querySelectorAll('#serialLog .log-entry');
        let visibleCount = 0;
        
        logEntries.forEach(entry => {
            // 只对"接收"类型的日志进行过滤
            if (entry.classList.contains('received')) {
                const entryText = entry.textContent;
                
                let isMatch = false;
                if (useRegex && searchTerm) {
                    try {
                        const regex = new RegExp(searchTerm, 'i'); // i 表示忽略大小写
                        isMatch = regex.test(entryText);
                    } catch (e) {
                        // 如果正则表达式有误，显示错误信息并不进行过滤
                        console.error("Invalid regex: ", e.message);
                        this.showMessage('正则表达式格式错误', 'error');
                        return; // 退出当前迭代，保持原有显示状态
                    }
                } else {
                    // 原来的文本包含匹配
                    isMatch = searchTerm ? entryText.toLowerCase().includes(searchTerm.toLowerCase()) : true;
                }
                
                if (isMatch) {
                    entry.classList.remove('filtered-out');
                    visibleCount++;
                } else {
                    entry.classList.add('filtered-out');
                }
            } else {
                entry.classList.remove('filtered-out');
                visibleCount++;
            }
        });
    },

    /**
     * 显示消息通知
     */
    showMessage: function(message, type) {
        // 创建临时消息元素
        let messageEl = document.querySelector('.search-message');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.className = 'search-message';
            messageEl.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 10px 15px;
                border-radius: 4px;
                color: white;
                background-color: #f44336;
                z-index: 9999;
                font-size: 14px;
            `;
            document.body.appendChild(messageEl);
        }
        
        messageEl.textContent = message;
        messageEl.style.backgroundColor = type === 'error' ? '#f44336' : '#4CAF50';
        
        // 设置定时器移除消息
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 3000);
    },

    /**
     * 添加新的AT命令标签页
     */
    addNewAtCommandTab: function() {
        // 向后端发送消息请求创建新的AT命令配置
        if (vscode) {
            vscode.postMessage({
                command: 'addNewAtConfig'
            });
        }
    },

    /**
     * 加载AT命令列表
     */
    loadAtCommands: function(configName = null) {
        // 从VSCode获取AT命令列表
        if (vscode) {
            vscode.postMessage({
                command: 'loadAtCommands',
                configName: configName
            });
        }
    },
    
    // 请求可用串口列表
    requestPorts: function() {
        // 请求VSCode后端获取串口列表
        if (vscode) {
            vscode.postMessage({
                command: 'requestPorts'
            });
        }
    },
    
    // 更新串口列表
    updatePortList: function(ports) {
        const portSelector = document.getElementById('portSelector');
        portSelector.innerHTML = '';
        
        if (ports.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '无可用串口';
            portSelector.appendChild(option);
        } else {
            ports.forEach((port) => {
                const option = document.createElement('option');
                option.value = port.path;  // 使用实际路径作为值
                option.textContent = `${port.path}`;
                portSelector.appendChild(option);
            });
        }
    },
    
    // 切换串口连接状态
    toggleConnection: function() {
        if (!this.isOpen) {
            this.openSerialPort();
        } else {
            this.closeSerialPort();
        }
    },
    
    // 打开串口
    openSerialPort: function() {
        try {
            // 获取用户选择的串口和波特率
            const portPath = document.getElementById('portSelector').value;
            const baudRate = parseInt(document.getElementById('baudRateSelector').value);
            
            if (!portPath || portPath === '') {
                this.addLog('请选择一个串口', 'error');
                return;
            }
            
            // 通知VSCode后端打开串口
            if (vscode) {
                vscode.postMessage({
                    command: 'serialConnected',
                    portPath: portPath,
                    baudRate: baudRate
                });
            }
            
            // 获取DTR和RTS的初始状态并发送设置
            const dtrState = document.getElementById('dtrCheckbox').checked;
            const rtsState = document.getElementById('rtsCheckbox').checked;
            
            // 发送DTR状态设置
            if (vscode) {
                vscode.postMessage({
                    command: 'setDTR',
                    state: dtrState
                });
            }
            
            // 发送RTS状态设置
            if (vscode) {
                vscode.postMessage({
                    command: 'setRTS',
                    state: rtsState
                });
            }
            
        } catch (err) {
            console.error('Error opening serial port:', err);
            this.addLog(`连接串口失败: ${err.message}`, 'error');
        }
    },
    
    // 关闭串口
    closeSerialPort: function() {
        try {
            // 通知VSCode后端关闭串口
            if (vscode) {
                vscode.postMessage({
                    command: 'serialDisconnected'
                });
            }
            // 立即更新本地UI状态，避免界面卡在"断开连接"状态
            SerialDebug.isOpen = false;
            document.getElementById('connectBtn').textContent = '连接';
            document.getElementById('connectBtn').classList.remove('btn-disconnect');
            document.getElementById('connectBtn').classList.add('btn-connect');
            // 启用端口选择下拉框
            document.getElementById('portSelector').disabled = false;
            // 启用波特率选择下拉框
            document.getElementById('baudRateSelector').disabled = false;
        } catch (err) {
            console.error('Error closing serial port:', err);
            this.addLog(`断开串口失败: ${err.message}`, 'error');
        }
    },
    
    // 发送数据
    sendData: function() {
        const sendText = document.getElementById('sendText').value.trim();
        if (!sendText) {
            this.addLog('请输入要发送的数据', 'error');
            return;
        }
        
        if (!this.isOpen) {
            this.addLog('串口未连接', 'error');
            return;
        }
        
        try {
            // 获取发送模式
            const isHexMode = document.getElementById('hexModeCheckbox').checked;
            const isCRLFMode = document.getElementById('crlfModeCheckbox').checked;
            if (vscode) { // 通知VSCode后端发送数据
                const isPhycial = /^#(DTR|RTS):[01]$/.test(sendText);   //是不是DTR RTS电平信号
                if (!isPhycial) {
                    vscode.postMessage({
                        command: 'sendData',
                        data: sendText,
                        isHex: isHexMode,
                        isCRLF: isCRLFMode
                    });
                    this.addSentData(sendText);
                } else {
                    const match = sendText.match(/^#(DTR|RTS):([01])$/);
                    if (match) {
                        const signalType = match[1];    // "DTR" 或 "CTS"
                        const state = match[2] === '1'; // true 或 false
                        if (signalType === 'DTR') {
                            vscode.postMessage({
                                command: 'setDTR',
                                state: state
                            });
                            this.addLog(`设置DTR电平: ${state ? '高' : '低'}`, 'info');
                        } else if (signalType === 'RTS') {
                            vscode.postMessage({
                                command: 'setRTS',
                                state: state
                            });
                            this.addLog(`设置RTS电平: ${state ? '高' : '低'}`, 'info');
                        }
                    }
                }
            }
            
        } catch (err) {
            console.error('Error sending data:', err);
            this.addLog(`发送数据失败: ${err.message}`, 'error');
        }
    },
    
    /**
     * 添加发送的数据到日志
     */
    addSentData: function(data) {
        const timestamp = new Date().toLocaleString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry sent';
        logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="direction">发送:</span> <span class="data">${this.escapeHtml(data)}</span>`;
        document.getElementById('serialLog').appendChild(logEntry);
        
        // 自动滚动到底部
        const logContainer = document.getElementById('serialLog');
        logContainer.scrollTop = logContainer.scrollHeight;
        
    },

    /**
     * 添加接收的数据到日志
     */
    addReceivedData: function(data) {
        // 自动化模式
        if (this.automation.isRunning) {
            const command = this.automation.commands[this.automation.currentStep];
            if (command && command.isOK) {
                if (data.includes(command.expectRsp)) {
                    this.addLog(`含预期数据: ${this.escapeHtml(data)}`, 'info');
                    if (this.automation.timer) {
                        clearTimeout(this.automation.timer);
                        this.automation.timer = null;
                    }
                    this.automation.timer = setTimeout(() => {
                        this.automation.currentStep++;
                        this.executeNextCommand();
                    }, command.delay);
                } else {
                    this.addLog(`非预期数据: ${this.escapeHtml(data)} 期望：${command.expectRsp}`, 'error'); 
                }
            }
        }
        const timestamp = new Date().toLocaleString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry received';
        // 监控模式
        const isMonitorMode = document.querySelector('.main-content').classList.contains('monitor-mode');
        if (isMonitorMode) {
            logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="data">${this.escapeHtml(data)}</span>`;
        } else {
            logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="direction">接收:</span> <span class="data">${this.escapeHtml(data)}</span>`;
        }
        document.getElementById('serialLog').appendChild(logEntry);
        // 自动滚动到底部
        const logContainer = document.getElementById('serialLog');
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // 如果在监控模式下，检查是否需要过滤这个条目
        if (isMonitorMode) {
            this.performLogSearch();
        }
    },

    /**
     * 添加日志信息
     */
    addLog: function(message, level = 'info') {
        const timestamp = new Date().toLocaleString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="log-level ${level}">${message}</span>`;
        document.getElementById('serialLog').appendChild(logEntry); 
        // 自动滚动到底部
        const logContainer = document.getElementById('serialLog');
        logContainer.scrollTop = logContainer.scrollHeight;
    },
    
    // 清空日志
    clearLog: function() {
        document.getElementById('serialLog').innerHTML = '';
        this.addLog('日志已清空', 'info');
    },
    
    // 保存日志
    saveLog: function() {
        const logContent = Array.from(document.getElementById('serialLog').children)
            .map(el => el.innerText)
            .join('\n');
            
        // 通知VSCode保存日志
        if (vscode) {
            vscode.postMessage({
                command: 'saveLog',
                content: logContent
            });
        }
    },
    
    // 转义HTML特殊字符
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        let escaped = div.innerHTML;
        // 特殊处理AT命令中可能包含的双引号，保留它们而不是转义
        escaped = escaped.replace(/&quot;/g, '"');
        return escaped;
    },
    
    // 加载AT命令配置列表
    loadAtConfigList: function() {
        // 从VSCode获取AT命令配置列表
        if (vscode) {
            vscode.postMessage({
                command: 'loadAtConfigList'
            });
        }
    },
    
    // 更新AT命令配置列表
    updateAtConfigList: function(configs) {
        const tabsContainer = document.getElementById('atConfigTabs');
        const existingTabs = tabsContainer.querySelectorAll('.at-config-tab');
        existingTabs.forEach(tab => tab.remove());
        // 添加配置项为标签页
        configs.forEach(config => {
            const tab = document.createElement('button');
            tab.className = 'at-config-tab';
            tab.textContent = config.displayName || config.name;
            tab.dataset.configName = config.name;
            // 添加点击事件
            tab.addEventListener('click', (e) => {
                const activeTabs = tabsContainer.querySelectorAll('.at-config-tab');
                activeTabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                // 发送消息到vscode
                if (vscode) {
                    vscode.postMessage({
                        command: 'loadAtCommands',
                        configName: config.name
                    });
                }
            });
            tabsContainer.appendChild(tab);
        });
        // 如果已有选中的配置，则更新标签选中状态
        setTimeout(() => {
            const firstTab = tabsContainer.querySelector('.at-config-tab');
            if (firstTab) {
                firstTab.click(); // 自动选择第一个标签
            }
        }, 0);
    },
    
    // 编辑AT命令
    editAtCommand: function(spanElement) {
        // 获取实际的命令值，如果显示的是&nbsp;则表示实际值为空
        let originalCommand = '';
        if (spanElement.innerHTML === '&nbsp;') {
            originalCommand = '';
        } else {
            originalCommand = spanElement.textContent;
        }
        
        const itemDiv = spanElement.parentElement;
        
        // 切换到编辑模式
        itemDiv.classList.add('editing');
        
        // 创建输入框并替换文本
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalCommand;
        input.dataset.original = originalCommand;
        
        // 替换span内容
        spanElement.parentNode.replaceChild(input, spanElement);
        
        // 聚焦到输入框
        input.focus();
    },
    
    // 保存AT命令
    saveAtCommand: function(inputElement) {
        const newValue = inputElement.value;
        const originalValue = inputElement.dataset.original;
        const itemDiv = inputElement.parentElement;
        
        // 如果值改变，则更新
        if (newValue !== originalValue) {
            // 创建新的span元素
            const span = document.createElement('span');
            span.textContent = newValue;
            if (newValue === '') {
                span.innerHTML = '&nbsp;';
            }
            
            // 替换输入框
            inputElement.parentNode.replaceChild(span, inputElement);
            
            // 移除编辑模式
            itemDiv.classList.remove('editing');
            
            // 获取当前命令的索引（序号）
            const commandItems = Array.from(document.querySelectorAll('.at-command-item'));
            const commandIndex = commandItems.indexOf(itemDiv);
            const button = itemDiv.querySelector('.send-at-cmd-icon');
            if (button) {
                button.setAttribute('data-command', newValue);
            }
            const activeTab = document.querySelector('.at-config-tab.active');
            let currentConfig = '';
            if (activeTab) {
                currentConfig = activeTab.dataset.configName;
            } else {
                // 如果没有激活的标签，尝试获取第一个标签
                const firstTab = document.querySelector('.at-config-tab');
                if (firstTab) {
                    currentConfig = firstTab.dataset.configName;
                }
            }
            
            if (vscode) {
                vscode.postMessage({
                    command: 'updateAtCommand',
                    oldCommand: originalValue,
                    newCommand: newValue,
                    configName: currentConfig,
                    commandIndex: commandIndex  // 添加序号参数
                });
            }
        } else {
            // 如果没有改变，恢复为span
            const span = document.createElement('span');
            span.textContent = originalValue;
            if (originalValue === '') {
                span.innerHTML = '&nbsp;';
            }
            inputElement.parentNode.replaceChild(span, inputElement);
            itemDiv.classList.remove('editing');
        }
    },
    
    // 显示AT命令
    displayAtCommands: function(commands) {
        const container = document.getElementById('atCommandsList');
        container.innerHTML = '';
        commands.forEach((cmd) => {
            const cmdElement = document.createElement('div');
            cmdElement.className = 'at-command-item';
            const escapedCmd = this.escapeHtml(cmd);
            if (this.isAutomationMode) {
                cmdElement.innerHTML = `
                    <span>${escapedCmd === '' ? '&nbsp;' : escapedCmd}</span>
                    <button class="add-at-cmd-icon" title="添加">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <button class="send-at-cmd-icon" title="发送">
                        <i class="fa-solid fa-angle-right"></i>
                    </button>
                `;
                //专门设置data-command属性
                let button = cmdElement.querySelector('.send-at-cmd-icon');
                button.setAttribute('data-command', cmd);
                button = cmdElement.querySelector('.add-at-cmd-icon');
                button.setAttribute('data-command', cmd);
            } else {
                cmdElement.innerHTML = `
                <span>${escapedCmd === '' ? '&nbsp;' : escapedCmd}</span>
                <button class="send-at-cmd-icon" title="发送">
                    <i class="fa-solid fa-angle-right"></i>
                </button>
                `;
                //专门设置data-command属性
                const button = cmdElement.querySelector('.send-at-cmd-icon');
                button.setAttribute('data-command', cmd);
            }
  
            container.appendChild(cmdElement);
        });
    },
    
    // 切换主题
    toggleTheme: function() {
        document.body.classList.toggle('light-theme');
        const themeButton = document.getElementById('themeToggleBtn');
        const isLightTheme = document.body.classList.contains('light-theme');
        if (isLightTheme) {
            themeButton.title = '暗色主题';
        } else {
            themeButton.title = '亮色主题';
        }
    },
    
    // 切换自动化模式
    toggleAutomationMode: function() {
        this.isAutomationMode = !this.isAutomationMode;
        const mainContent = document.querySelector('.main-content');
        const automationButton = document.getElementById('automationModeToggleBtn');
        const activeTab = document.querySelector('.at-config-tab.active');

        if (this.isAutomationMode) {
            mainContent.classList.add('automation-mode');
            automationButton.title = '关闭自动化';
            this.addLog('自动化模式已开启', 'info');
        } else {
            mainContent.classList.remove('automation-mode');
            automationButton.title = '开启自动化';
            this.addLog('自动化模式已关闭', 'info');
        }
        let configName = '';
        if (activeTab) {
            configName = activeTab.dataset.configName;
        } else {
            const firstTab = document.querySelector('.at-config-tab');
            if (firstTab) {
                configName = firstTab.dataset.configName;
            }
        }
        if (vscode) {
            vscode.postMessage({
                command: 'loadAtCommands',
                configName: configName
            }); 
        }

    },
    
    // 切换显示/隐藏所有自动化命令的特殊配置
    toggleAllCommandConfigs: function() {
        const allSpecialConfigs = document.querySelectorAll('.command-special-config');
        this.automation.shouldShow = false;
        // 检查是否所有配置都是隐藏的
        for (const config of allSpecialConfigs) {
            if (config.style.display === 'none' || config.style.display === '') {
                this.automation.shouldShow = true;
                break;
            }
        }
        // 切换所有配置的显示状态
        for (const config of allSpecialConfigs) {
            if (this.automation.shouldShow) {
                config.style.display = 'flex';
            } else {
                config.style.display = 'none';
            }
        }
        
        // 更新按钮图标和标题
        const captureBtn = document.getElementById('captureAutomationBtn');
        if (this.automation.shouldShow) {
            captureBtn.title = '收起';
        } else {
            captureBtn.title = '展开';
        }
    },

    // 切换面板模式
    togglePanelMode: function() {
        const mainContent = document.querySelector('.main-content');
        const isMonitorMode = mainContent.classList.contains('monitor-mode');
        
        if (isMonitorMode) {
            mainContent.classList.remove('monitor-mode');
            this.clearLog();
            this.addLog('交互模式', 'info');
            const logContainer = document.getElementById('serialLog');
            logContainer.contentEditable = false;
            logContainer.removeAttribute('tabindex');
            // 移除回车键处理事件
            logContainer.removeEventListener('keydown', this.handleMonitorInput.bind(this));
        } else {
            mainContent.classList.add('monitor-mode');
            this.clearLog();
            this.addLog('监控模式', 'info');
            // 在监控模式下聚焦到日志容器并使其可编辑
            const logContainer = document.getElementById('serialLog');
            logContainer.contentEditable = true;
            logContainer.setAttribute('tabindex', '0');
            logContainer.focus();
            // 添加回车键处理事件
            logContainer.addEventListener('keydown', this.handleMonitorInput.bind(this));
        }
        // 显示或隐藏搜索过滤容器
        const searchFilterContainer = document.getElementById('searchFilterContainer');
        if (mainContent.classList.contains('monitor-mode')) {
            searchFilterContainer.style.display = 'flex';
        } else {
            searchFilterContainer.style.display = 'none';
        }
    },
    
    // 处理监控模式下的输入
    handleMonitorInput: function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const logContainer = document.getElementById('serialLog');
            const inputText = logContainer.innerText.trim();
            logContainer.innerText = '';
            if (inputText) {
                document.getElementById('sendText').value = inputText;
                this.sendData();
            }
        }
    },

    /**
     * 初始化自动化执行功能
     */
    initAutomation: function() {
        // 从localStorage加载保存的自动化序列
        const savedAutomation = localStorage.getItem('automationSequence');
        if (savedAutomation) {
            try {
                this.automation.commands = JSON.parse(savedAutomation);
                this.renderAutomationTrack();
            } catch (e) {
                console.error('Failed to load automation sequence:', e);
                this.automation.commands = [];
            }
        }
    },

    /**
     * 设置自动化相关的事件监听器
     */
    setupAutomationEventListeners: function() {

        document.getElementById('importCommandsBtn').addEventListener('click', () => {
            this.importSelectedCommands();
        });

        document.getElementById('clearAutomationBtn').addEventListener('click', () => {
            this.clearAutomationSequence();
        });

        document.getElementById('toggleAutomationBtn').addEventListener('click', () => {
            if (this.automation.isRunning) {
                this.stopAutomation();
            } else {
                this.startAutomation();
            }
        });

        document.getElementById('pauseResumeBtn').addEventListener('click', () => {
            if (this.automation.isRunning) {
                if (this.automation.isPaused) {
                    this.resumeAutomation();
                } else { 
                    this.pauseAutomation();
                }
            }
        });

        this.setupDragAndDrop();
    },

    /**
     * 从AT命令列表导入选中的命令
     */
    importSelectedCommands: function() {
        const atCommandItems = document.querySelectorAll('#atCommandsList .at-command-item');
        const selectedCommands = [];
        
        atCommandItems.forEach(item => {
            const span = item.querySelector('span');
            const commandText = span ? span.textContent.trim() : '';
            if (commandText && commandText !== '&nbsp;') {
                selectedCommands.push({
                    id: 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    command: commandText,
                    delay: 1000,
                    isHex: false,
                    isCRLF: true,
                    isOK: false,
                    timeout: 3000,
                    expectRsp: "OK"
                });
            }
        });

        if (selectedCommands.length === 0) {
            this.addLog('没有可导入的AT命令', 'warning');
            return;
        }

        // 添加到自动化序列
        this.automation.commands.push(...selectedCommands);
        this.renderAutomationTrack();
        this.saveAutomationSequence();
        this.addLog(`成功导入 ${selectedCommands.length} 个AT命令到自动化序列`, 'success');
    },

    /**
     * 清空自动化序列
     */
    clearAutomationSequence: function() {
        if (this.automation.commands.length > 0) {
            this.automation.commands = [];
            this.renderAutomationTrack();
            this.saveAutomationSequence();
            this.addLog('自动化序列已清空', 'info');
        } else {
            this.addLog('自动化序列已经是空的', 'info');
        }
    },

    /**
     * 渲染自动化轨道
     */
    renderAutomationTrack: function() {
        const track = document.getElementById('automationTrack');
        track.innerHTML = '';

        if (this.automation.commands.length === 0) {
            track.innerHTML = '<div class="track-placeholder">拖拽AT命令到这里创建自动化序列</div>';
            return;
        }
        this.automation.commands.forEach((cmd, index) => {
            const commandElement = this.createAutomationCommandElement(cmd, index);
            track.appendChild(commandElement);
        });
    },

    /**
     * 创建自动化命令元素
     */
    createAutomationCommandElement: function(command, index) {
        const element = document.createElement('div');
        element.className = 'automation-command-item';
        element.draggable = true;
        element.dataset.commandId = command.id;
        element.dataset.index = index;
        element.innerHTML = `
            <div class="automation-command-item-main">
                <div class="command-drag-handle" title="拖拽排序">
                    <button class="automation-item-icon setting-command-btn" title="配置">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                </div>
                <div class="command-content">${this.escapeHtml(command.command)}</div>
                <div class="command-settings">
                    <label>
                        <i class="fa-solid fa-clock-rotate-left"></i>
                        <input type="number" class="delay-input" value="${command.delay}" min="0" max="60000" data-field="delay" step="10">
                        ms
                    </label>
                    <button class="automation-item-icon remove-command-btn" title="移除">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            <div class="command-special-config" style="${this.automation.shouldShow ? 'display: flex;' : 'display: none;'}">
                <label>
                    <input type="checkbox" class="hex-config-checkbox" ${command.isHex ? 'checked' : ''}>
                    HEX
                </label>
                <label>
                    <input type="checkbox" class="crlf-config-checkbox" ${command.isCRLF ? 'checked' : ''}>
                    CRLF
                </label>
                <label>
                    <i class="fa-regular fa-bell" title="响应期望"></i>
                    <input type="text" class="exp-input" value="${command.expectRsp}">
                    <i class="fa-regular fa-hourglass" title="响应超时"></i>
                    <input type="number" class="timeout-input" value="${command.timeout}" min="0" max="300000" data-field="timeout" step="10">
                    ms
                </label>
                <label>
                    <input type="checkbox" class="ok-config-checkbox" ${command.isOK ? 'checked' : ''}>
                </label>
            </div>
        `;

        // 添加事件监听器
        this.attachCommandElementEvents(element, command);
        
        return element;
    },

    /**
     * 为命令元素添加事件监听器
     */
    attachCommandElementEvents: function(element, command) {
        const delayInput = element.querySelector('.delay-input');
        delayInput.addEventListener('change', (e) => {
            command.delay = parseInt(e.target.value) || 1000;
            this.saveAutomationSequence();
        });
        const removeBtn = element.querySelector('.remove-command-btn');
        removeBtn.addEventListener('click', () => {
            this.removeAutomationCommand(command.id);
        });
        const timeoutInput = element.querySelector('.timeout-input');
        timeoutInput.addEventListener('change', (e) => {
            command.timeout = parseInt(e.target.value) || 3000;
            this.saveAutomationSequence();
        });
        const expInput = element.querySelector('.exp-input');
        expInput.addEventListener('change', (e) => {
            command.expectRsp = e.target.value;
            this.saveAutomationSequence();
        });
        // 添加配置按钮事件监听器
        const settingBtn = element.querySelector('.setting-command-btn');
        const specialConfig = element.querySelector('.command-special-config');
        settingBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (specialConfig.style.display === 'none' || specialConfig.style.display === '') {
                specialConfig.style.display = 'flex';
                settingBtn.title = '隐藏配置';
            } else {
                specialConfig.style.display = 'none';
                settingBtn.title = '更多配置';
            }
        });
        
        // 添加特殊配置复选框的事件监听器
        const hexCheckbox = element.querySelector('.hex-config-checkbox');
        const crlfCheckbox = element.querySelector('.crlf-config-checkbox');
        const okCheckbox = element.querySelector('.ok-config-checkbox');
        if (hexCheckbox) {
            hexCheckbox.addEventListener('change', (e) => {
                command.isHex = e.target.checked;
                this.saveAutomationSequence();
            });
        }
        
        if (crlfCheckbox) {
            crlfCheckbox.addEventListener('change', (e) => {
                command.isCRLF = e.target.checked;
                this.saveAutomationSequence();
            });
        }
        if (okCheckbox) {
            okCheckbox.addEventListener('change', (e) => {
                command.isOK = e.target.checked;
                this.saveAutomationSequence();
            });
        }
    },

    /**
     * 移除自动化命令
     */
    removeAutomationCommand: function(commandId) {
        const index = this.automation.commands.findIndex(cmd => cmd.id === commandId);
        if (index !== -1) {
            this.automation.commands.splice(index, 1);
            this.renderAutomationTrack();
            this.saveAutomationSequence();
            this.addLog('命令已从自动化序列中移除', 'info');
        }
    },

    /**
     * 设置拖拽功能
     */
    setupDragAndDrop: function() {
        const track = document.getElementById('automationTrack');
        
        track.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('automation-command-item')) {
                e.target.classList.add('dragging');
                e.dataTransfer.setData('text/plain', e.target.dataset.commandId);
                
                // 添加拖拽阴影效果
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        track.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('automation-command-item')) {
                e.target.classList.remove('dragging');
                
                // 移除所有可能的放置指示器
                const dropIndicators = track.querySelectorAll('.drop-indicator');
                dropIndicators.forEach(indicator => indicator.remove());
            }
        });

        track.addEventListener('dragover', (e) => {
            e.preventDefault();
            track.classList.add('drag-over');
            
            // 查找最近的命令项
            const commandItems = Array.from(track.querySelectorAll('.automation-command-item'));
            
            // 移除所有现有的放置指示器
            const existingIndicators = track.querySelectorAll('.drop-indicator');
            existingIndicators.forEach(indicator => indicator.remove());
            
            // 移除所有高亮样式
            const highlightedItems = track.querySelectorAll('.drop-target-before, .drop-target-after');
            highlightedItems.forEach(item => {
                item.classList.remove('drop-target-before', 'drop-target-after');
            });
            
            // 计算鼠标在容器中的相对位置
            const mouseY = e.clientY;
            
            // 为每个命令项添加放置指示器
            for (let i = 0; i < commandItems.length; i++) {
                const item = commandItems[i];
                
                // 跳过正在被拖拽的元素
                if (item.dataset.commandId === e.target.closest('.automation-command-item')?.dataset.commandId) {
                    continue;
                }
                
                const itemRect = item.getBoundingClientRect();
                
                // 如果鼠标在元素上方的前半部分，则在该项前面显示指示器
                if (mouseY < itemRect.top + itemRect.height / 2) {
                    const indicator = document.createElement('div');
                    indicator.className = 'drop-indicator';
                    track.insertBefore(indicator, item);
                    
                    // 高亮显示目标位置
                    item.classList.add('drop-target-before');
                    
                    // 只在当前位置添加一个指示器
                    break;
                } 
                // 如果鼠标在最后一项且在元素下半部分，则在该项后面显示指示器
                else if (i === commandItems.length - 1 && mouseY > itemRect.top + itemRect.height / 2) {
                    const indicator = document.createElement('div');
                    indicator.className = 'drop-indicator';
                    track.appendChild(indicator);
                    
                    // 高亮显示目标位置
                    item.classList.add('drop-target-after');
                    
                    break;
                }
            }
        });

        track.addEventListener('dragleave', (e) => {
            if (!track.contains(e.relatedTarget)) {
                track.classList.remove('drag-over');
                
                // 移除放置指示器
                const dropIndicators = track.querySelectorAll('.drop-indicator');
                dropIndicators.forEach(indicator => indicator.remove());
                
                // 移除高亮样式
                const highlightedItems = track.querySelectorAll('.drop-target-before, .drop-target-after');
                highlightedItems.forEach(item => {
                    item.classList.remove('drop-target-before', 'drop-target-after');
                });
            }
        });

        track.addEventListener('drop', (e) => {
            e.preventDefault();
            track.classList.remove('drag-over');
            
            const commandId = e.dataTransfer.getData('text/plain');
            
            // 查找带有高亮样式的元素来确定放置位置
            const beforeTarget = track.querySelector('.drop-target-before');
            const afterTarget = track.querySelector('.drop-target-after');
            
            if (commandId) {
                if (beforeTarget && beforeTarget.dataset.commandId !== commandId) {
                    // 放置在该元素之前
                    this.reorderAutomationCommands(commandId, beforeTarget.dataset.commandId);
                } else if (afterTarget && afterTarget.dataset.commandId !== commandId) {
                    // 放置在该元素之后
                    this.moveCommandAfter(commandId, afterTarget.dataset.commandId);
                } else if (!beforeTarget && !afterTarget) {
                    // 如果没有高亮元素，可能是放置在末尾
                    const lastCommandItem = track.querySelector('.automation-command-item:last-child');
                    if (lastCommandItem && lastCommandItem.dataset.commandId !== commandId) {
                        this.moveCommandAfter(commandId, lastCommandItem.dataset.commandId);
                    }
                }
            }
            
            // 移除所有放置指示器
            const dropIndicators = track.querySelectorAll('.drop-indicator');
            dropIndicators.forEach(indicator => indicator.remove());
            
            // 移除高亮样式
            const highlightedItems = track.querySelectorAll('.drop-target-before, .drop-target-after');
            highlightedItems.forEach(item => {
                item.classList.remove('drop-target-before', 'drop-target-after');
            });
        });
    },

    /**
     * 将命令移动到指定命令之后
     */
    moveCommandAfter: function(sourceId, targetId) {
        const sourceIndex = this.automation.commands.findIndex(cmd => cmd.id === sourceId);
        const targetIndex = this.automation.commands.findIndex(cmd => cmd.id === targetId);
        
        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
            return; // 源命令或目标命令不存在，或为同一命令
        }
        
        // 提取要移动的命令
        const [movedCommand] = this.automation.commands.splice(sourceIndex, 1);
        
        // 计算插入位置：插入到目标索引之后
        // 如果原始位置在目标位置之前，因为移除了元素，所以目标索引需要减1
        const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        const insertIndex = adjustedTargetIndex + 1; // +1 表示插入到目标元素之后
        
        // 插入到正确位置
        this.automation.commands.splice(insertIndex, 0, movedCommand);
        
        this.renderAutomationTrack();
        this.saveAutomationSequence();
        this.addLog('命令顺序已调整', 'info');
    },

    /**
     * 重新排序自动化命令
     */
    reorderAutomationCommands: function(sourceId, targetId) {
        const sourceIndex = this.automation.commands.findIndex(cmd => cmd.id === sourceId);
        
        if (sourceIndex === -1) {
            return; 
        }
        if (!targetId) {
            return;
        }
        const targetIndex = this.automation.commands.findIndex(cmd => cmd.id === targetId);
        if (targetIndex === -1 || sourceIndex === targetIndex) {
            return; // 目标命令不存在或相同位置
        }
        // 提取要移动的命令
        const [movedCommand] = this.automation.commands.splice(sourceIndex, 1);
        let insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        // 插入到正确位置
        this.automation.commands.splice(insertIndex, 0, movedCommand);
        this.renderAutomationTrack();
        this.saveAutomationSequence();
        this.addLog('命令顺序已调整', 'info');
    },

    /**
     * 保存自动化序列到localStorage
     */
    saveAutomationSequence: function() {
        localStorage.setItem('automationSequence', JSON.stringify(this.automation.commands));
    },

    /**
     * 开始自动化执行
     */
    startAutomation: function() {
        if (this.automation.commands.length === 0) {
            this.addLog('请先添加要执行的AT命令', 'error');
            return;
        }

        if (!this.isOpen) {
            this.addLog('请先连接串口', 'error');
            return;
        }

        // 获取设置参数
        const loopCount = parseInt(document.getElementById('loopCountInput').value) || 1;

        // 初始化执行状态
        this.automation.isRunning = true;
        this.automation.isPaused = false;
        this.automation.currentStep = 0;
        this.automation.loopCount = 0;
        this.automation.totalLoops = loopCount;
        this.automation.startTime = Date.now();

        // 更新UI
        this.updateAutomationUI('running');

        this.addLog(`自动化执行开始，共${loopCount === -1 ? '无限' : loopCount}次循环`, 'success');
        // 开始执行
        this.executeNextCommand();
        
    },

    /**
     * 暂停自动化执行
     */
    pauseAutomation: function() {
        this.automation.isPaused = true;
        this.updateAutomationUI('paused');
        this.addLog('自动化执行已暂停', 'warning');
    },

    /**
     * 继续自动化执行
     */
    resumeAutomation: function() {
        this.automation.isPaused = false;
        this.updateAutomationUI('running');
        this.executeNextCommand();
        this.addLog('自动化执行继续', 'success');
    },

    /**
     * 停止自动化执行
     */
    stopAutomation: function() {
        this.automation.isRunning = false;
        this.automation.isPaused = false;
        if (this.automation.timer) {
            clearTimeout(this.automation.timer);
            this.automation.timer = null;
        }
        this.updateAutomationUI('stopped');
        this.addLog('自动化执行已停止', 'info');
    },

    /**
     * 执行下一个命令
     */
    executeNextCommand: function() {

        if (!this.automation.isRunning || this.automation.isPaused) {
            return;
        }

        if (this.automation.totalLoops !== -1 && 
            this.automation.loopCount >= this.automation.totalLoops) {
            this.stopAutomation();
            this.addLog('自动化执行完成', 'success');
            return;
        }

        // 检查是否完成当前循环
        if (this.automation.currentStep >= this.automation.commands.length) {
            // 重置当前步骤，准备下一次循环
            this.automation.currentStep = 0;
            this.automation.loopCount++;
            
            if (this.automation.totalLoops !== -1) {
                this.addLog(`第${this.automation.loopCount}次循环完成`, 'info');
            }
            // 如果还有循环次数，继续执行
            if (this.automation.totalLoops === -1 || this.automation.loopCount < this.automation.totalLoops) {
                const interval = parseInt(document.getElementById('commandIntervalInput').value) || 1000;
                this.automation.timer = setTimeout(() => {
                    this.executeNextCommand();
                }, interval);
            } else {
                this.stopAutomation();
                this.addLog('自动化执行完成', 'success');
            }
            return;
        }

        // 执行当前命令
        const command = this.automation.commands[this.automation.currentStep];
        this.highlightCurrentCommand(this.automation.currentStep);
        this.updateProgress();
        if (vscode) {
            const isPhycial = /^#(DTR|RTS):[01]$/.test(`${command.command}`);  //是不是DTR RTS电平信号
            if (!isPhycial) {
                // 发送命令
                vscode.postMessage({
                    command: 'sendData',
                    data: command.command,
                    isHex: command.isHex || false,
                    isCRLF: command.isCRLF,
                    isOK: command.isOK || false
                });
                this.addSentData(`${command.command}`);
            } else {
                const match = `${command.command}`.match(/^#(DTR|RTS):([01])$/);
                if (match) {
                    const signalType = match[1];    // "DTR" 或 "CTS"
                    const state = match[2] === '1'; // true 或 false
                    if (signalType === 'DTR') {
                        vscode.postMessage({
                            command: 'setDTR',
                            state: state
                        });
                        this.addLog(`设置DTR电平: ${state ? '高' : '低'}`, 'info');
                    } else if (signalType === 'RTS') {
                        vscode.postMessage({
                            command: 'setRTS',
                            state: state
                        });
                        this.addLog(`设置RTS电平: ${state ? '高' : '低'}`, 'info');
                    }
                }
            }
        }
        // 需要等待AT执行OK响应
        if (command.isOK) {
            if (this.automation.timer) {
                clearTimeout(this.automation.timer);
                this.automation.timer = null;
            }
            // 捕获模式：定时超时后停止自动流程
            this.automation.timer = setTimeout(() => {
                if (!this.automation.isPaused 
                && this.automation.isRunning) {
                    this.addLog(`自动化捕获到异常`, 'error');
                    this.stopAutomation();
                }
            }, command.timeout);
        } else {
            // 延迟执行下一个命令
            this.automation.timer = setTimeout(() => {
                if (!this.automation.isPaused && this.automation.isRunning) {
                    this.automation.currentStep++;
                    this.executeNextCommand();
                }
            }, command.delay);
        }
    },

    /**
     * 高亮显示当前执行的命令
     */
    highlightCurrentCommand: function(stepIndex) {
        // 移除之前的高亮
        document.querySelectorAll('.automation-command-item').forEach(item => {
            item.style.border = '1px solid var(--border-color)';
            item.style.backgroundColor = 'var(--select-bg)';
        });
        // 高亮当前命令
        const currentItem = document.querySelector(`.automation-command-item[data-index="${stepIndex}"]`);
        if (currentItem) {
            currentItem.style.border = '2px solid var(--primary-color)';
            currentItem.style.backgroundColor = 'var(--at-command-item-hover)';
        }
    },

    /**
     * 更新执行进度
     */
    updateProgress: function() {
        const totalSteps = this.automation.commands.length * 
                          (this.automation.totalLoops === -1 ? 1 : this.automation.totalLoops);
        const currentStep = this.automation.loopCount * this.automation.commands.length + 
                           this.automation.currentStep;
        const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
        const progressText = document.querySelector('.progress-text');
        const elapsedTimeElement = document.querySelector('.elapsed-time');
        if(this.automation.totalLoops !== -1){
            if (progressText) progressText.textContent = `总进度：${Math.round(progress)}%`;
        }
        if (elapsedTimeElement && this.automation.startTime) {
            const elapsed = Math.floor((Date.now() - this.automation.startTime) / 1000);
            elapsedTimeElement.textContent = `总耗时: ${elapsed}s`;
        }
    },

    /**
     * 更新自动化UI状态
     */
    updateAutomationUI: function(state) {
        const toggleBtn = document.getElementById('toggleAutomationBtn');
        const pauseBtn = document.getElementById('pauseResumeBtn');
        const autoStatus = document.getElementById('automationStatus');

        // 隐藏所有图标
        const togglePlayIcon = toggleBtn.querySelector('.fa-solid.fa-play');
        const toggleStopIcon = toggleBtn.querySelector('.fa-solid.fa-stop');
        const pausePauseIcon = pauseBtn.querySelector('.fa-solid.fa-pause');
        const pauseResumeIcon = pauseBtn.querySelector('.fa-solid.fa-play.resume');

        if (state === 'running') {
            // 切换按钮显示停止图标
            togglePlayIcon.style.display = 'none';
            toggleStopIcon.style.display = 'block';
            toggleBtn.title = '停止';
            // 暂停按钮显示暂停图标
            pausePauseIcon.style.display = 'block';
            pauseResumeIcon.style.display = 'none';
            pauseBtn.title = '暂停';
            pauseBtn.disabled = false;
            autoStatus.style.display = 'flex';

        } else if (state === 'paused') {
            // 切换按钮保持停止图标
            togglePlayIcon.style.display = 'none';
            toggleStopIcon.style.display = 'block';
            toggleBtn.title = '停止';
            // 暂停按钮显示继续图标
            pausePauseIcon.style.display = 'none';
            pauseResumeIcon.style.display = 'block';
            pauseBtn.title = '继续';
            autoStatus.style.display = 'flex';
        } else { // stopped
            // 切换按钮显示播放图标
            togglePlayIcon.style.display = 'block';
            toggleStopIcon.style.display = 'none';
            toggleBtn.title = '开始';
            // 暂停按钮显示暂停图标（但禁用）
            pausePauseIcon.style.display = 'block';
            pauseResumeIcon.style.display = 'none';
            pauseBtn.title = '暂停';
            pauseBtn.disabled = true;
            autoStatus.style.display = 'none';
        }
    },

    /**
     * 将AT命令添加到自动化轨道
     */
    addCommandToAutomationTrack: function(commandText , isCRLF = true, isHex = false) {
        // 创建命令对象
        const commandObj = {
            id: 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            command: commandText,
            delay: 1000,
            isCRLF: isCRLF,
            isHex: isHex,
            isOK: false,
            timeout: 3000,
            expectRsp: 'OK',
        };
        // 添加到自动化序列
        this.automation.commands.push(commandObj);
        this.renderAutomationTrack();
        this.saveAutomationSequence();
        this.addLog(`已添加 "${commandText}" 到序列`, 'success');
    },

};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    SerialDebug.init();
});

// 监听来自VSCode的消息
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'updatePorts':
            SerialDebug.updatePortList(message.ports || []);
            break;
        case 'updateAtConfigList':
            SerialDebug.updateAtConfigList(message.configs || []);
            break;
        case 'displayAtCommands':
            SerialDebug.displayAtCommands(message.commands || []);
            break;
        case 'addLog':
            SerialDebug.addLog(message.content, message.level || 'info');
            break;
        case 'addReceivedData':
            SerialDebug.addReceivedData(message.data);
            break;
        case 'serialConnected':
            // 更新UI状态
            SerialDebug.isOpen = true;
            document.getElementById('connectBtn').textContent = '断开';
            document.getElementById('connectBtn').classList.remove('btn-connect');
            document.getElementById('connectBtn').classList.add('btn-disconnect');
            SerialDebug.addLog(`串口已连接，路径: ${message.portPath}, 波特率: ${message.baudRate}`, 'success');
            // 禁用端口选择下拉框
            document.getElementById('portSelector').disabled = true;
            // 禁用波特率选择下拉框
            document.getElementById('baudRateSelector').disabled = true;
            
            // 设置DTR和RTS的初始状态
            const dtrState = document.getElementById('dtrCheckbox').checked;
            const rtsState = document.getElementById('rtsCheckbox').checked;
            
            if (vscode) {
                vscode.postMessage({
                    command: 'setDTR',
                    state: dtrState
                });
            }
            
            if (vscode) {
                vscode.postMessage({
                    command: 'setRTS',
                    state: rtsState
                });
            }
            break;
        case 'serialDisconnected':
            // 更新UI状态
            SerialDebug.isOpen = false;
            document.getElementById('connectBtn').textContent = '连接';
            document.getElementById('connectBtn').classList.remove('btn-disconnect');
            document.getElementById('connectBtn').classList.add('btn-connect');
            SerialDebug.addLog('串口已断开', 'info');
            // 启用端口选择下拉框
            document.getElementById('portSelector').disabled = false;
            // 启用波特率选择下拉框
            document.getElementById('baudRateSelector').disabled = false;
            break;
    }
});