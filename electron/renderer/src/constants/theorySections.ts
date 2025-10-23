export interface SectionOption {
  value: string;
  label: string;
  lessons: string[];
}

export const SECTION_OPTIONS: SectionOption[] = [
  {
    value: '1',
    label: 'Section 1',
    lessons: ['Arrays', 'Linked Lists', 'Cursor-Based', 'Stack', 'Queue', 'ADT List'],
  },
  {
    value: '2',
    label: 'Section 2',
    lessons: ['SET and ADT Set', 'ADT Dictionary'],
  },
  {
    value: '3',
    label: 'Section 3',
    lessons: [
      'ADT Tree and Implementations',
      'Binary Search Tree (BST)',
      'Heapsort Sorting Technique',
      'Directed and Undirected Graph',
      'Graph Algorithms',
      'ADT Priority Queue',
    ],
  },
];
