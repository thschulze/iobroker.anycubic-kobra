'use strict';

const utils = require('@iobroker/adapter-core');
const axios = require('axios');
const mqtt = require('mqtt');

/**
 * Anycubic Kobra Adapter
 * Supports Kobra S1, Kobra 3 and compatible models
 */
class AnycubicKobra extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'anycubic-kobra',
        });

        this.mqttClient = null;
        this.printers = new Map();
        this.pollTimer = null;
        this.connected = false;

        // Anycubic Cloud API endpoints
        this.API_BASE = 'https://cloud-universe.anycubic.com';
        this.MQTT_BROKER = 'mqtts://mqtt-universe.anycubic.com:8883';

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Adapter startup
     */
    async onReady() {
        this.log.info('Starting Anycubic Kobra adapter...');

        // Validate configuration
        if (!this.config.cloudToken) {
            this.log.error('No cloud token configured. Please configure the adapter.');
            return;
        }

        // Initialize connection based on mode
        if (this.config.connectionMode === 'cloud') {
            await this.initCloudConnection();
        } else if (this.config.connectionMode === 'local') {
            await this.initLocalConnection();
        }

        // Start polling if configured
        if (this.config.pollInterval > 0) {
            this.startPolling();
        }

        // Subscribe to control states
        this.subscribeStates('*.control.*');
    }

    /**
     * Initialize Anycubic Cloud connection
     */
    async initCloudConnection() {
        this.log.info('Connecting to Anycubic Cloud...');

        try {
            // Get printer list from cloud
            const printerList = await this.fetchPrinters();

            if (printerList && printerList.length > 0) {
                for (const printer of printerList) {
                    await this.createPrinterObjects(printer);
                    this.printers.set(printer.id, printer);
                }
                this.log.info(`Found ${printerList.length} printer(s)`);
            }

            // Initialize MQTT connection for real-time updates
            if (this.config.mqttEnabled) {
                await this.initMqttConnection();
            }

            await this.setStateAsync('info.connection', true, true);
            this.connected = true;

        } catch (error) {
            this.log.error(`Cloud connection failed: ${error.message}`);
            await this.setStateAsync('info.connection', false, true);
        }
    }

    /**
     * Initialize local LAN connection
     */
    async initLocalConnection() {
        this.log.info('Initializing local LAN connection...');

        if (this.config.printers && this.config.printers.length > 0) {
            for (const printerConfig of this.config.printers) {
                if (printerConfig.enabled && printerConfig.ip) {
                    try {
                        await this.connectLocalPrinter(printerConfig);
                    } catch (error) {
                        this.log.error(`Failed to connect to ${printerConfig.name}: ${error.message}`);
                    }
                }
            }
        }
    }

    /**
     * Connect to a local printer via LAN
     */
    async connectLocalPrinter(printerConfig) {
        const printerId = printerConfig.id || printerConfig.name.toLowerCase().replace(/\s+/g, '_');

        this.log.info(`Connecting to local printer: ${printerConfig.name} (${printerConfig.ip})`);

        // Test connection
        try {
            const response = await axios.get(`http://${printerConfig.ip}:80/api/version`, {
                timeout: 5000
            });

            const printer = {
                id: printerId,
                name: printerConfig.name,
                model: printerConfig.model || 'Kobra',
                ip: printerConfig.ip,
                local: true,
                status: 'online'
            };

            await this.createPrinterObjects(printer);
            this.printers.set(printerId, printer);

            // Camera URL for Kobra S1
            if (printerConfig.model === 'Kobra S1') {
                await this.setStateAsync(`${printerId}.camera.streamUrl`,
                    `http://${printerConfig.ip}:18088/flv`, true);
            }

        } catch (error) {
            this.log.warn(`Local printer ${printerConfig.name} not reachable: ${error.message}`);
        }
    }

    /**
     * Initialize MQTT connection for real-time updates
     */
    async initMqttConnection() {
        this.log.info('Connecting to Anycubic MQTT broker...');

        const options = {
            clientId: `iobroker_${this.namespace}_${Date.now()}`,
            username: 'anycubic_user',
            password: this.config.cloudToken,
            rejectUnauthorized: false,
            reconnectPeriod: 5000,
            connectTimeout: 30000
        };

        try {
            this.mqttClient = mqtt.connect(this.MQTT_BROKER, options);

            this.mqttClient.on('connect', () => {
                this.log.info('MQTT connected successfully');
                this.subscribeMqttTopics();
            });

            this.mqttClient.on('message', (topic, message) => {
                this.handleMqttMessage(topic, message);
            });

            this.mqttClient.on('error', (error) => {
                this.log.error(`MQTT error: ${error.message}`);
            });

            this.mqttClient.on('close', () => {
                this.log.warn('MQTT connection closed');
            });

        } catch (error) {
            this.log.error(`MQTT connection failed: ${error.message}`);
        }
    }

    /**
     * Subscribe to MQTT topics for all printers
     */
    subscribeMqttTopics() {
        for (const [printerId, printer] of this.printers) {
            const topics = [
                `anycubic/printer/${printerId}/status`,
                `anycubic/printer/${printerId}/temperature`,
                `anycubic/printer/${printerId}/progress`,
                `anycubic/printer/${printerId}/job`
            ];

            topics.forEach(topic => {
                this.mqttClient.subscribe(topic, (err) => {
                    if (err) {
                        this.log.error(`Failed to subscribe to ${topic}`);
                    }
                });
            });
        }
    }

    /**
     * Handle incoming MQTT messages
     */
    handleMqttMessage(topic, message) {
        try {
            const data = JSON.parse(message.toString());
            const parts = topic.split('/');
            const printerId = parts[2];
            const dataType = parts[3];

            this.log.debug(`MQTT message for ${printerId}: ${dataType}`);

            switch (dataType) {
                case 'status':
                    this.updatePrinterStatus(printerId, data);
                    break;
                case 'temperature':
                    this.updateTemperature(printerId, data);
                    break;
                case 'progress':
                    this.updateProgress(printerId, data);
                    break;
                case 'job':
                    this.updateJobInfo(printerId, data);
                    break;
            }
        } catch (error) {
            this.log.error(`Failed to process MQTT message: ${error.message}`);
        }
    }

    /**
     * Fetch printers from Anycubic Cloud API
     */
    async fetchPrinters() {
        try {
            const response = await axios.get(`${this.API_BASE}/api/v1/printers`, {
                headers: {
                    'Authorization': `Bearer ${this.config.cloudToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (response.data && response.data.data) {
                return response.data.data.map(p => ({
                    id: p.id || p.printer_id,
                    name: p.name || p.printer_name,
                    model: p.model || p.printer_model,
                    status: p.status || 'unknown',
                    online: p.online || false
                }));
            }
            return [];
        } catch (error) {
            this.log.error(`Failed to fetch printers: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetch printer status from cloud
     */
    async fetchPrinterStatus(printerId) {
        try {
            const response = await axios.get(`${this.API_BASE}/api/v1/printers/${printerId}/status`, {
                headers: {
                    'Authorization': `Bearer ${this.config.cloudToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            return response.data.data || null;
        } catch (error) {
            this.log.debug(`Failed to fetch status for ${printerId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Create ioBroker objects for a printer
     */
    async createPrinterObjects(printer) {
        const id = printer.id;

        // Main printer device
        await this.setObjectNotExistsAsync(id, {
            type: 'device',
            common: {
                name: printer.name || 'Anycubic Printer',
                icon: 'img/printer.png'
            },
            native: { model: printer.model }
        });

        // Info channel
        await this.setObjectNotExistsAsync(`${id}.info`, {
            type: 'channel',
            common: { name: 'Printer Information' },
            native: {}
        });

        // Status states
        const infoStates = [
            { id: 'name', name: 'Printer Name', type: 'string', role: 'text', write: false },
            { id: 'model', name: 'Printer Model', type: 'string', role: 'text', write: false },
            { id: 'status', name: 'Printer Status', type: 'string', role: 'text', write: false },
            { id: 'online', name: 'Online', type: 'boolean', role: 'indicator.reachable', write: false },
            { id: 'firmware', name: 'Firmware Version', type: 'string', role: 'text', write: false }
        ];

        for (const state of infoStates) {
            await this.setObjectNotExistsAsync(`${id}.info.${state.id}`, {
                type: 'state',
                common: {
                    name: state.name,
                    type: state.type,
                    role: state.role,
                    read: true,
                    write: state.write
                },
                native: {}
            });
        }

        // Temperature channel
        await this.setObjectNotExistsAsync(`${id}.temperature`, {
            type: 'channel',
            common: { name: 'Temperature' },
            native: {}
        });

        const tempStates = [
            { id: 'nozzle', name: 'Nozzle Temperature', unit: '°C' },
            { id: 'nozzleTarget', name: 'Nozzle Target', unit: '°C' },
            { id: 'bed', name: 'Bed Temperature', unit: '°C' },
            { id: 'bedTarget', name: 'Bed Target', unit: '°C' },
            { id: 'chamber', name: 'Chamber Temperature', unit: '°C' }
        ];

        for (const state of tempStates) {
            await this.setObjectNotExistsAsync(`${id}.temperature.${state.id}`, {
                type: 'state',
                common: {
                    name: state.name,
                    type: 'number',
                    role: 'value.temperature',
                    unit: state.unit,
                    read: true,
                    write: false
                },
                native: {}
            });
        }

        // Print job channel
        await this.setObjectNotExistsAsync(`${id}.job`, {
            type: 'channel',
            common: { name: 'Print Job' },
            native: {}
        });

        const jobStates = [
            { id: 'name', name: 'Job Name', type: 'string', role: 'text' },
            { id: 'progress', name: 'Progress', type: 'number', role: 'value', unit: '%' },
            { id: 'layer', name: 'Current Layer', type: 'number', role: 'value' },
            { id: 'totalLayers', name: 'Total Layers', type: 'number', role: 'value' },
            { id: 'timeElapsed', name: 'Time Elapsed', type: 'number', role: 'value.interval', unit: 's' },
            { id: 'timeRemaining', name: 'Time Remaining', type: 'number', role: 'value.interval', unit: 's' },
            { id: 'printSpeed', name: 'Print Speed', type: 'number', role: 'value', unit: '%' }
        ];

        for (const state of jobStates) {
            await this.setObjectNotExistsAsync(`${id}.job.${state.id}`, {
                type: 'state',
                common: {
                    name: state.name,
                    type: state.type,
                    role: state.role,
                    unit: state.unit || '',
                    read: true,
                    write: false
                },
                native: {}
            });
        }

        // Control channel
        await this.setObjectNotExistsAsync(`${id}.control`, {
            type: 'channel',
            common: { name: 'Controls' },
            native: {}
        });

        const controlStates = [
            { id: 'pause', name: 'Pause Print', type: 'boolean', role: 'button' },
            { id: 'resume', name: 'Resume Print', type: 'boolean', role: 'button' },
            { id: 'stop', name: 'Stop Print', type: 'boolean', role: 'button' },
            { id: 'light', name: 'Light', type: 'boolean', role: 'switch.light' },
            { id: 'fan', name: 'Fan Speed', type: 'number', role: 'level', min: 0, max: 100 }
        ];

        for (const state of controlStates) {
            await this.setObjectNotExistsAsync(`${id}.control.${state.id}`, {
                type: 'state',
                common: {
                    name: state.name,
                    type: state.type,
                    role: state.role,
                    min: state.min,
                    max: state.max,
                    read: true,
                    write: true
                },
                native: {}
            });
        }

        // Camera channel
        await this.setObjectNotExistsAsync(`${id}.camera`, {
            type: 'channel',
            common: { name: 'Camera' },
            native: {}
        });

        await this.setObjectNotExistsAsync(`${id}.camera.streamUrl`, {
            type: 'state',
            common: {
                name: 'Camera Stream URL',
                type: 'string',
                role: 'url',
                read: true,
                write: false
            },
            native: {}
        });

        // Set initial values
        await this.setStateAsync(`${id}.info.name`, printer.name || '', true);
        await this.setStateAsync(`${id}.info.model`, printer.model || '', true);
        await this.setStateAsync(`${id}.info.status`, printer.status || 'unknown', true);
        await this.setStateAsync(`${id}.info.online`, printer.online || false, true);
    }

    /**
     * Update printer status
     */
    async updatePrinterStatus(printerId, data) {
        if (data.status) {
            await this.setStateAsync(`${printerId}.info.status`, data.status, true);
        }
        if (data.online !== undefined) {
            await this.setStateAsync(`${printerId}.info.online`, data.online, true);
        }
    }

    /**
     * Update temperature values
     */
    async updateTemperature(printerId, data) {
        if (data.nozzle !== undefined) {
            await this.setStateAsync(`${printerId}.temperature.nozzle`, data.nozzle, true);
        }
        if (data.nozzleTarget !== undefined) {
            await this.setStateAsync(`${printerId}.temperature.nozzleTarget`, data.nozzleTarget, true);
        }
        if (data.bed !== undefined) {
            await this.setStateAsync(`${printerId}.temperature.bed`, data.bed, true);
        }
        if (data.bedTarget !== undefined) {
            await this.setStateAsync(`${printerId}.temperature.bedTarget`, data.bedTarget, true);
        }
        if (data.chamber !== undefined) {
            await this.setStateAsync(`${printerId}.temperature.chamber`, data.chamber, true);
        }
    }

    /**
     * Update print progress
     */
    async updateProgress(printerId, data) {
        if (data.progress !== undefined) {
            await this.setStateAsync(`${printerId}.job.progress`, data.progress, true);
        }
        if (data.layer !== undefined) {
            await this.setStateAsync(`${printerId}.job.layer`, data.layer, true);
        }
        if (data.totalLayers !== undefined) {
            await this.setStateAsync(`${printerId}.job.totalLayers`, data.totalLayers, true);
        }
    }

    /**
     * Update job information
     */
    async updateJobInfo(printerId, data) {
        if (data.name) {
            await this.setStateAsync(`${printerId}.job.name`, data.name, true);
        }
        if (data.timeElapsed !== undefined) {
            await this.setStateAsync(`${printerId}.job.timeElapsed`, data.timeElapsed, true);
        }
        if (data.timeRemaining !== undefined) {
            await this.setStateAsync(`${printerId}.job.timeRemaining`, data.timeRemaining, true);
        }
        if (data.printSpeed !== undefined) {
            await this.setStateAsync(`${printerId}.job.printSpeed`, data.printSpeed, true);
        }
    }

    /**
     * Start polling for updates
     */
    startPolling() {
        const interval = (this.config.pollInterval || 30) * 1000;

        this.pollTimer = setInterval(async () => {
            await this.pollPrinters();
        }, interval);

        this.log.info(`Polling started with interval: ${interval / 1000}s`);
    }

    /**
     * Poll all printers for updates
     */
    async pollPrinters() {
        for (const [printerId, printer] of this.printers) {
            try {
                const status = await this.fetchPrinterStatus(printerId);
                if (status) {
                    await this.updatePrinterStatus(printerId, status);
                    if (status.temperature) {
                        await this.updateTemperature(printerId, status.temperature);
                    }
                    if (status.job) {
                        await this.updateProgress(printerId, status.job);
                        await this.updateJobInfo(printerId, status.job);
                    }
                }
            } catch (error) {
                this.log.debug(`Polling failed for ${printerId}: ${error.message}`);
            }
        }
    }

    /**
     * Handle state changes (control commands)
     */
    async onStateChange(id, state) {
        if (!state || state.ack) return;

        const parts = id.split('.');
        const printerId = parts[2];
        const control = parts[4];

        this.log.info(`Control command: ${control} for printer ${printerId}`);

        try {
            switch (control) {
                case 'pause':
                    await this.sendCommand(printerId, 'pause');
                    break;
                case 'resume':
                    await this.sendCommand(printerId, 'resume');
                    break;
                case 'stop':
                    await this.sendCommand(printerId, 'stop');
                    break;
                case 'light':
                    await this.sendCommand(printerId, 'light', { enabled: state.val });
                    break;
                case 'fan':
                    await this.sendCommand(printerId, 'fan', { speed: state.val });
                    break;
            }
        } catch (error) {
            this.log.error(`Command failed: ${error.message}`);
        }
    }

    /**
     * Send command to printer
     */
    async sendCommand(printerId, command, params = {}) {
        const printer = this.printers.get(printerId);

        if (printer && printer.local) {
            // Local LAN command
            await axios.post(`http://${printer.ip}/api/control/${command}`, params, {
                timeout: 5000
            });
        } else {
            // Cloud API command
            await axios.post(`${this.API_BASE}/api/v1/printers/${printerId}/control`, {
                command: command,
                ...params
            }, {
                headers: {
                    'Authorization': `Bearer ${this.config.cloudToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
        }

        this.log.info(`Command ${command} sent to ${printerId}`);
    }

    /**
     * Adapter shutdown
     */
    onUnload(callback) {
        try {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
            }

            if (this.mqttClient) {
                this.mqttClient.end();
            }

            this.log.info('Anycubic Kobra adapter stopped');
            callback();
        } catch (e) {
            callback();
        }
    }
}

// Start adapter
if (require.main !== module) {
    module.exports = (options) => new AnycubicKobra(options);
} else {
    new AnycubicKobra();
}
