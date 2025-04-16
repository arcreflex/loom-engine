import { useInput } from 'ink';
import { useEffect, useState } from 'react';

interface ScrollableSelectListProps<T> {
  items: T[];
  maxVisibleItems: number;
  focusedIndex: number | undefined;
  onFocusedIndexChange: (newIndex: number | undefined) => void;
  onSelectItem: (item: T, index: number) => void;
  renderItem: (item: T, isFocused: boolean) => React.ReactNode;
}

export function ScrollableSelectList<Item>({
  items,
  maxVisibleItems,
  focusedIndex,
  renderItem,
  onFocusedIndexChange,
  onSelectItem
}: ScrollableSelectListProps<Item>) {
  const isActive = focusedIndex !== undefined;

  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0);
  useEffect(() => {
    const currentLastVisibleIndex = firstVisibleIndex + maxVisibleItems - 1;
    let nextFirstVisibleIndex = firstVisibleIndex;

    if (focusedIndex === undefined) {
      nextFirstVisibleIndex = 0;
    } else if (focusedIndex < firstVisibleIndex) {
      nextFirstVisibleIndex = focusedIndex;
    } else if (focusedIndex > currentLastVisibleIndex) {
      nextFirstVisibleIndex = focusedIndex - maxVisibleItems + 1;
    }

    const maxPossibleFirstIndex = Math.max(0, items.length - maxVisibleItems);
    nextFirstVisibleIndex = Math.max(
      0,
      Math.min(nextFirstVisibleIndex, maxPossibleFirstIndex)
    );

    if (nextFirstVisibleIndex !== firstVisibleIndex) {
      setFirstVisibleIndex(nextFirstVisibleIndex);
    }
  }, [focusedIndex, maxVisibleItems, items.length, firstVisibleIndex]);

  const visibleItems = items.slice(
    firstVisibleIndex,
    firstVisibleIndex + maxVisibleItems
  );

  useInput(
    async (_input, key) => {
      if (items.length === 0) return;
      if (focusedIndex === undefined) return;
      if (key.return) {
        // Navigate to selected child
        const selectedItem = items[focusedIndex];
        if (selectedItem) {
          onSelectItem(selectedItem, focusedIndex);
        }
        return;
      }

      let newFocusedIndex = focusedIndex;
      if (key.upArrow) {
        newFocusedIndex = focusedIndex - 1;
      } else if (key.downArrow) {
        newFocusedIndex = focusedIndex + 1;
      }

      if (newFocusedIndex < 0) {
        onFocusedIndexChange(undefined);
      }

      if (newFocusedIndex < items.length && newFocusedIndex !== focusedIndex) {
        onFocusedIndexChange(newFocusedIndex);
      }
    },
    { isActive }
  );

  return (
    <>
      {visibleItems.map((item, i) => {
        const index = firstVisibleIndex + i;
        const isFocused = isActive && index === focusedIndex;
        return renderItem(item, isFocused);
      })}
    </>
  );
}
