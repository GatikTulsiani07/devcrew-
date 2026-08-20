import test from 'node:test';
import assert from 'node:assert';
import { verifyWorkflowEvidenceConsistency } from '../src/tasks/workflow-evidence-verifier';

test('should accept valid early states with no artifacts', () => {
  const evidence = {};
  const result = verifyWorkflowEvidenceConsistency(evidence);
  assert.strictEqual(result.consistent, true);
  assert.strictEqual(result.violations.length, 0);
});

test('should detect VALIDATION_WITHOUT_EXECUTION', () => {
  const evidence = {
    validationEvidence: { exists: true },
    developerExecutionEvidence: { completed: false },
  };
  const result = verifyWorkflowEvidenceConsistency(evidence);
  assert.strictEqual(result.consistent, false);
  assert.ok(result.violations.some(v => v.code === 'VALIDATION_WITHOUT_EXECUTION'));
});

test('should detect REVIEW_WITHOUT_VALIDATION', () => {
  const evidence = {
    reviewEvidence: { approved: true },
    validationEvidence: { exists: false },
  };
  const result = verifyWorkflowEvidenceConsistency(evidence);
  assert.strictEqual(result.consistent, false);
  assert.ok(result.violations.some(v => v.code === 'REVIEW_WITHOUT_VALIDATION'));
});

test('should detect PULL_REQUEST_WITHOUT_REVIEW', () => {
  const evidence = {
    pullRequestEvidence: { exists: true },
    reviewEvidence: { approved: false },
  };
  const result = verifyWorkflowEvidenceConsistency(evidence);
  assert.strictEqual(result.consistent, false);
  assert.ok(result.violations.some(v => v.code === 'PULL_REQUEST_WITHOUT_REVIEW'));
});

test('should detect REMOTE_BRANCH_WITHOUT_CHECKPOINT', () => {
  const evidence = {
    remoteBranchEvidence: { exists: true, sha: 'abc123' },
    checkpointEvidence: { sha: undefined },
  };
  const result = verifyWorkflowEvidenceConsistency(evidence);
  assert.strictEqual(result.consistent, false);
  assert.ok(result.violations.some(v => v.code === 'REMOTE_BRANCH_WITHOUT_CHECKPOINT'));
});

test('should detect CHECKPOINT_SHA_MISMATCH', () => {
  const evidence = {
    remoteBranchEvidence: { exists: true, sha: 'abc123' },
    checkpointEvidence: { sha: 'def456' },
  };
  const result = verifyWorkflowEvidenceConsistency(evidence);
  assert.strictEqual(result.consistent, false);
  assert.ok(result.violations.some(v => v.code === 'CHECKPOINT_SHA_MISMATCH'));
});

test('should accept valid consistent evidence', () => {
  const evidence = {
    developerExecutionEvidence: { completed: true },
    validationEvidence: { exists: true },
    reviewEvidence: { approved: true },
    pullRequestEvidence: { exists: true },
    checkpointEvidence: { sha: 'sha123' },
    remoteBranchEvidence: { exists: true, sha: 'sha123' },
  };

  const result = verifyWorkflowEvidenceConsistency(evidence);
  assert.strictEqual(result.consistent, true);
  assert.strictEqual(result.violations.length, 0);
});
