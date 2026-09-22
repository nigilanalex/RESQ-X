const crypto = require('node:crypto');

const MOTOR_COMMAND_TOPIC = 'resqx/robot/motor/command';
const MOTOR_STATUS_TOPIC = 'resqx/robot/motor/status';
// The simulator listens only here, so simulation can never reach a physical
// controller subscribed to MOTOR_COMMAND_TOPIC.
const MOTOR_SIMULATOR_COMMAND_TOPIC = 'resqx/robot/motor/simulator';
const MOTOR_COMMANDS = new Set(['forward', 'backward', 'left', 'right', 'stop']);
const MOTOR_STATES = new Set(['forward', 'backward', 'left', 'right', 'stopped', 'offline']);
const MOTOR_SOURCES = new Set(['motor-esp32', 'simulator']);
const MAX_MOTOR_STATUS_BYTES = 2048;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateMotorCommand(command) {
  if (typeof command !== 'string' || !MOTOR_COMMANDS.has(command)) {
    const error = new Error('Invalid motor command');
    error.statusCode = 400;
    throw error;
  }
  return command;
}

function normalizeMotorStatus(raw) {
  if (!isPlainObject(raw)) throw new Error('motor status must be a JSON object');
  const allowed = ['online', 'state', 'source', 'simulated', 'controllerId', 'commandId', 'reason'];
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new Error('unexpected motor status field');
  if (typeof raw.online !== 'boolean') throw new Error('motor online must be boolean');
  if (!MOTOR_STATES.has(raw.state)) throw new Error('invalid motor state');
  if (!MOTOR_SOURCES.has(raw.source)) throw new Error('invalid motor source');
  if (typeof raw.simulated !== 'boolean' || raw.simulated !== (raw.source === 'simulator')) throw new Error('invalid motor simulation marker');
  if (typeof raw.controllerId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw.controllerId)) throw new Error('invalid motor controller ID');
  if (raw.commandId !== undefined && raw.commandId !== null && (typeof raw.commandId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(raw.commandId))) throw new Error('invalid motor command ID');
  if (raw.reason !== undefined && raw.reason !== null && (typeof raw.reason !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(raw.reason))) throw new Error('invalid motor status reason');
  if (raw.online && raw.state === 'offline') throw new Error('online motor cannot report offline state');

  return {
    online: raw.online,
    state: raw.online ? raw.state : 'offline',
    source: raw.source,
    simulated: raw.simulated,
    controllerId: raw.controllerId,
    commandId: raw.commandId || null,
    reason: raw.reason || null,
  };
}

function createMotorCommand(command) {
  return { command: validateMotorCommand(command), commandId: crypto.randomUUID(), issuedAt: Date.now() };
}

module.exports = {
  MOTOR_COMMAND_TOPIC,
  MOTOR_STATUS_TOPIC,
  MOTOR_SIMULATOR_COMMAND_TOPIC,
  MOTOR_COMMANDS,
  MAX_MOTOR_STATUS_BYTES,
  validateMotorCommand,
  normalizeMotorStatus,
  createMotorCommand,
};
