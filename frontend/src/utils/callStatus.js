export const CALL_STATUSES = [
  { value: 'none', label: '— Status —' },
  { value: 'first_call_completed', label: 'First Call Completed' },
  { value: 'second_call_completed', label: 'Second Call Completed' },
  { value: 'third_call_completed', label: 'Third Call Completed' },
  { value: 'switch_off', label: 'Switch Off' },
  { value: 'busy', label: 'Busy' },
  { value: 'after_call', label: 'After Call' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'interested', label: 'Interested' },
  { value: 'hold', label: 'Hold' },
];

export const statusColor = {
  none: 'bg-gray-200 text-gray-700',
  first_call_completed: 'bg-blue-100 text-blue-700',
  second_call_completed: 'bg-blue-200 text-blue-800',
  third_call_completed: 'bg-indigo-200 text-indigo-800',
  switch_off: 'bg-gray-300 text-gray-800',
  busy: 'bg-yellow-200 text-yellow-800',
  after_call: 'bg-purple-200 text-purple-800',
  not_interested: 'bg-red-200 text-red-800',
  interested: 'bg-green-200 text-green-800',
  hold: 'bg-orange-200 text-orange-800',
};
