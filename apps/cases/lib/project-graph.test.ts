import { describe, it, expect } from 'vitest';
import { buildChildIndex, addAncestors, addDescendants, type RawProject } from './project-graph';

// Hierarchy under test:
//   root
//   ├─ acqA            (ACQUISITION_SOURCE)
//   │   └─ branchA
//   │       └─ ref1    (REFERRER)
//   └─ acqB
//       └─ ref2        (REFERRER)
//   orphan             (no parent, unrelated)
const projects: RawProject[] = [
    { id: 'root', parentId: null },
    { id: 'acqA', parentId: 'root' },
    { id: 'branchA', parentId: 'acqA' },
    { id: 'ref1', parentId: 'branchA' },
    { id: 'acqB', parentId: 'root' },
    { id: 'ref2', parentId: 'acqB' },
    { id: 'orphan', parentId: null },
];

describe('buildChildIndex', () => {
    it('indexes every project by id and maps parents to their children', () => {
        const { byId, childrenByParent } = buildChildIndex(projects);
        expect(byId.size).toBe(7);
        expect(byId.get('ref1')?.parentId).toBe('branchA');
        expect(childrenByParent.get('root')).toEqual(['acqA', 'acqB']);
        expect(childrenByParent.get('branchA')).toEqual(['ref1']);
        // Leaves and orphans have no children entry.
        expect(childrenByParent.has('ref1')).toBe(false);
        expect(childrenByParent.has('orphan')).toBe(false);
    });
});

describe('addAncestors', () => {
    it('walks up to the root, collecting every ancestor', () => {
        const { byId } = buildChildIndex(projects);
        const into = new Set<string>(['ref1']);
        addAncestors(['ref1'], byId, into);
        expect([...into].sort()).toEqual(['acqA', 'branchA', 'ref1', 'root']);
    });

    it('is a no-op for a root-level node', () => {
        const { byId } = buildChildIndex(projects);
        const into = new Set<string>(['orphan']);
        addAncestors(['orphan'], byId, into);
        expect([...into]).toEqual(['orphan']);
    });
});

describe('addDescendants', () => {
    it('walks down collecting the whole subtree', () => {
        const { childrenByParent } = buildChildIndex(projects);
        const into = new Set<string>(['root']);
        addDescendants(['root'], childrenByParent, into);
        expect([...into].sort()).toEqual(['acqA', 'acqB', 'branchA', 'ref1', 'ref2', 'root']);
    });

    it('returns only the root when the node is a leaf', () => {
        const { childrenByParent } = buildChildIndex(projects);
        const into = new Set<string>(['ref1']);
        addDescendants(['ref1'], childrenByParent, into);
        expect([...into]).toEqual(['ref1']);
    });
});

describe('cycle / large-graph safety', () => {
    it('terminates on a cyclic parent reference instead of looping forever', () => {
        // Defensive: a corrupt row pointing at its own descendant must not hang.
        const cyclic: RawProject[] = [
            { id: 'a', parentId: 'b' },
            { id: 'b', parentId: 'a' },
        ];
        const { byId, childrenByParent } = buildChildIndex(cyclic);

        const up = new Set<string>(['a']);
        addAncestors(['a'], byId, up);
        expect(up).toEqual(new Set(['a', 'b']));

        const down = new Set<string>(['a']);
        addDescendants(['a'], childrenByParent, down);
        expect(down).toEqual(new Set(['a', 'b']));
    });
});
