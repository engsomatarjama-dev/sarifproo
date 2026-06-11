import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const srcRoot = path.join(root, 'src');

const collectSourceFiles = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, {withFileTypes: true});
  return entries.flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
};

describe('AutomationCoordinator boundary', () => {
  it('keeps UssdAutomationService as an internal coordinator dependency', () => {
    const allowed = new Set([
      path.normalize(path.join(srcRoot, 'services/AutomationCoordinator.ts')),
      path.normalize(path.join(srcRoot, 'services/UssdAutomationService.ts')),
      path.normalize(path.join(srcRoot, 'services/__tests__/AutomationCoordinatorBoundary.test.ts')),
    ]);
    const offenders = collectSourceFiles(srcRoot).filter(file => {
      if (allowed.has(path.normalize(file))) {
        return false;
      }
      const contents = fs.readFileSync(file, 'utf8');
      return contents.includes('UssdAutomationService') || contents.includes('ussdAutomationService');
    });

    expect(offenders.map(file => path.relative(root, file))).toEqual([]);
  });
});
