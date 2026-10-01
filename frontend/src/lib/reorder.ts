export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const isOutOfRange = (index: number) => index < 0 || index >= items.length;
  if (isOutOfRange(fromIndex) || isOutOfRange(toIndex) || fromIndex === toIndex) return [...items];

  const result = [...items];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved as T);
  return result;
}
