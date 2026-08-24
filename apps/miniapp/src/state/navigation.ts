export type SelectEntryIntent = "favorites";

let selectEntryIntent: SelectEntryIntent | null = null;
let savedListDetailIntent: string | null = null;

export function requestFavoriteSelectionView(): void {
  selectEntryIntent = "favorites";
}

export function consumeSelectEntryIntent(): SelectEntryIntent | null {
  const intent = selectEntryIntent;
  selectEntryIntent = null;
  return intent;
}

export function requestSavedListDetail(listId: string): void {
  savedListDetailIntent = listId;
}

export function consumeSavedListDetail(): string | null {
  const listId = savedListDetailIntent;
  savedListDetailIntent = null;
  return listId;
}
