import sqlite from './sqlite';

export const run = sqlite.run;
export const get = sqlite.get;
export const all = sqlite.all;
export const exportData = sqlite.exportData;
export const importData = sqlite.importData;

export default sqlite;
