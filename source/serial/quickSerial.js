const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class QuickSerial {
    constructor() {
        this.port = null;
        this.parser = null;
        this.isOpen = false;
        this.availablePorts = [];
        this.onReceiveCallback = null;
    }

    async listPorts() {
        try {
            this.availablePorts = await SerialPort.list();
            return this.availablePorts;
        } catch (err) {
            console.error('Error listing serial ports:', err);
            return [];
        }
    }

    async open(path, baudRate = 115200) {
        if (this.isOpen && this.port) {
            await this.close();
        }

        try {
            this.port = new SerialPort({ path, baudRate, autoOpen: false });

            this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

            this.parser.on('data', (data) => {
                if (this.onReceiveCallback) {
                    this.onReceiveCallback(data.toString());
                }
            });

            this.port.on('error', (err) => {
                console.error('Serial port error:', err);
                this.isOpen = false;
            });

            await new Promise((resolve, reject) => {
                this.port.open((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.isOpen = true;
                        resolve();
                    }
                });
            });

            return true;
        } catch (err) {
            console.error('Error opening serial port:', err);
            this.isOpen = false;
            return false;
        }
    }

    async close() {
        if (!this.port) {
            return;
        }

        try {
            if (this.parser) {
                this.parser.removeAllListeners('data');
            }

            if (this.port) {
                this.port.removeAllListeners('error');

                if (this.port.isOpen) {
                    await new Promise((resolve) => {
                        this.port.close(() => resolve());
                    });
                }

                this.port = null;
            }

            this.parser = null;
            this.isOpen = false;
        } catch (err) {
            console.error('Error closing serial port:', err);
        }
    }

    async write(data, isHex = false, isCRLF = true) {
        if (!this.port || !this.isOpen) {
            throw new Error('Serial port is not open');
        }

        try {
            if (isHex) {
                const buffer = Buffer.from(data.replace(/\s/g, ''), 'hex');
                await new Promise((resolve, reject) => {
                    this.port.write(buffer, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            } else {
                await new Promise((resolve, reject) => {
                    if (isCRLF) {
                        this.port.write(data + '\r\n', (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    } else {
                        this.port.write(data, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    }
                });
            }
        } catch (err) {
            console.error('Error writing to serial port:', err);
            throw err;
        }
    }

    setOnReceive(callback) {
        this.onReceiveCallback = callback;
    }

    getIsOpen() {
        return this.isOpen;
    }

    getPath() {
        return this.port ? this.port.path : null;
    }

    async setDTR(state) {
        if (!this.port || !this.isOpen) {
            throw new Error('Serial port is not open');
        }
        await new Promise((resolve, reject) => {
            this.port.set({ dtr: state }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async setRTS(state) {
        if (!this.port || !this.isOpen) {
            throw new Error('Serial port is not open');
        }
        await new Promise((resolve, reject) => {
            this.port.set({ rts: state }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

module.exports = QuickSerial;
