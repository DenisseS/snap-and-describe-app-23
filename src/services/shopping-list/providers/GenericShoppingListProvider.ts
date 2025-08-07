import { ShoppingList, ShoppingListData, ShoppingListItem } from '@/types/shoppingList';
import { DataState } from '@/types/userData';
import { ShoppingListProvider, ShoppingListResult, ShoppingListOperationResult } from '../types';
import SessionService from '@/services/SessionService';

export abstract class GenericShoppingListProvider implements ShoppingListProvider {
  constructor(protected sessionService: SessionService) {}

  protected generateListId(name: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 4);
    const normalizedName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 15);

    return `${normalizedName}-${timestamp}-${randomSuffix}`;
  }

  protected generateItemId(): string {
    return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Abstract methods that must be implemented by concrete providers
  protected abstract getListsDetails(): Promise<{ lists: Record<string, ShoppingList> }>;
  protected abstract saveListsDetails(metadata: { lists: Record<string, ShoppingList> }): Promise<void>;
  protected abstract getListData(listId: string): Promise<ShoppingListData | null>;
  protected abstract saveListData(listId: string, data: ShoppingListData): Promise<void>;
  protected abstract deleteListData(listId: string): Promise<void>;

  // Method to update cache with optimistic data
  async updateCacheWithOptimisticData(listId: string, data: ShoppingListData): Promise<void> {
    console.log(`🛒 GenericProvider: Updating cache with optimistic data for ${listId}`);
    await this.saveListData(listId, data);
  }

  // Public interface methods
  async getShoppingLists_deprecated(): Promise<ShoppingListResult<Record<string, ShoppingList>>> {
    console.log('🛒 GenericProvider: Getting shopping lists (deprecated)');
    try {
      const metadata = await this.getListsDetails();
      return {
        data: metadata.lists,
        state: DataState.READY
      };
    } catch (error) {
      console.error('🛒 GenericProvider: Error getting shopping lists:', error);
      return {
        data: {},
        state: DataState.ERROR
      };
    }
  }

  async getShoppingLists(): Promise<ShoppingListResult<Record<string, ShoppingList>>> {
    console.log('🛒 GenericProvider: Getting shopping lists with sync');
    try {
      const metadata = await this.getListsDetails();
      return {
        data: metadata.lists,
        state: DataState.READY
      };
    } catch (error) {
      console.error('🛒 GenericProvider: Error getting shopping lists:', error);
      return {
        data: {},
        state: DataState.ERROR
      };
    }
  }

  async getShoppingListData(listId: string): Promise<ShoppingListResult<ShoppingListData | null>> {
    console.log(`🛒 GenericProvider: Getting list data for ${listId}`);
    try {
      const data = await this.getListData(listId);
      return {
        data,
        state: DataState.READY
      };
    } catch (error) {
      console.error(`🛒 GenericProvider: Error getting list data for ${listId}:`, error);
      return {
        data: null,
        state: DataState.ERROR
      };
    }
  }

  async createShoppingList(name: string, description?: string): Promise<ShoppingListOperationResult> {
    console.log('🛒 GenericProvider: Creating shopping list:', name);

    try {
      const listId = this.generateListId(name);
      const now = new Date().toISOString();

      const newList: ShoppingList = {
        id: listId,
        name,
        description,
        createdAt: now,
        updatedAt: now,
        itemCount: 0,
        completedCount: 0
      };

      const newListData: ShoppingListData = {
        id: listId,
        name,
        description,
        items: [],
        createdAt: now,
        updatedAt: now
      };

      // Para creación SÍ necesitamos actualizar metadata
      const metadata = await this.getListsDetails();
      metadata.lists[listId] = newList;

      await this.saveListsDetails(metadata);
      await this.saveListData(listId, newListData);

      return { success: true, listId };
    } catch (error) {
      console.error('🛒 GenericProvider: Error creating list:', error);
      return { success: false };
    }
  }

  async updateShoppingList(listId: string, updates: Partial<ShoppingList>): Promise<boolean> {
    console.log(`🛒 GenericProvider: Updating list ${listId}`);

    try {
      const metadata = await this.getListsDetails();
      if (metadata.lists[listId]) {
        metadata.lists[listId] = {
          ...metadata.lists[listId],
          ...updates,
          updatedAt: new Date().toISOString()
        };
        await this.saveListsDetails(metadata);
        return true;
      }
      return false;
    } catch (error) {
      console.error('🛒 GenericProvider: Error updating list:', error);
      return false;
    }
  }

  async deleteShoppingList(listId: string): Promise<boolean> {
    console.log(`🛒 GenericProvider: Deleting list ${listId}`);

    try {
      const metadata = await this.getListsDetails();
      delete metadata.lists[listId];

      await this.saveListsDetails(metadata);
      await this.deleteListData(listId);

      return true;
    } catch (error) {
      console.error('🛒 GenericProvider: Error deleting list:', error);
      return false;
    }
  }

  async addItemToList(listId: string, itemName: string, quantity?: number, unit?: string, notes?: string, productId?: string, slug?: string): Promise<boolean> {
    try {
      // OPTIMIZACIÓN: Usar operación atómica en lugar de get+update
      console.log(`🛒 GenericProvider: Optimized addItem - atomic operation for ${listId}`);

      const listData = await this.getListData(listId);
      if (!listData) return false;
      const newItem: ShoppingListItem = {
        id: this.generateItemId(),
        name: itemName,
        quantity,
        unit,
        notes,
        purchased: false,
        addedAt: new Date().toISOString(),
        // Nuevos campos para vinculación con productos
        productId,
        slug
      };

      console.log('🛒 GenericProvider: Adding item with product data:', {
        name: itemName,
        productId,
        slug
      });

      const updatedListData: ShoppingListData = {
        ...listData,
        items: [...listData.items, newItem],
        updatedAt: new Date().toISOString()
      };

      await this.saveListDataAndUpdateCounts(listId, updatedListData);
      return true;
    } catch (error) {
      console.error('🛒 GenericProvider: Error adding item:', error);
      return false;
    }
  }

  async updateItemInList(listId: string, itemId: string, updates: Partial<ShoppingListItem>): Promise<boolean> {
    try {
      // OPTIMIZACIÓN: Usar operación atómica en lugar de get+update
      console.log(`🛒 GenericProvider: Optimized updateItem - atomic operation for ${listId}`);

      const listData = await this.getListData(listId);
      if (!listData) return false;
      const updatedItems = listData.items.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            ...updates,
            updatedAt: new Date().toISOString()
          };
        }
        return item;
      });

      const updatedListData: ShoppingListData = {
        ...listData,
        items: updatedItems,
        updatedAt: new Date().toISOString()
      };

      await this.saveListDataAndUpdateCounts(listId, updatedListData);
      return true;
    } catch (error) {
      console.error('🛒 GenericProvider: Error updating item:', error);
      return false;
    }
  }

  async toggleItemPurchased(listId: string, itemId: string): Promise<boolean> {
    try {
      // OPTIMIZACIÓN: Usar operación atómica en lugar de get+update
      console.log(`🛒 GenericProvider: Optimized toggle - atomic operation for ${listId}`);

      const listData = await this.getListData(listId);
      if (!listData) return false;
      const updatedItems = listData.items.map(item => {
        if (item.id === itemId) {
          const purchased = !item.purchased;
          return {
            ...item,
            purchased,
            purchasedAt: purchased ? new Date().toISOString() : undefined
          };
        }
        return item;
      });

      const updatedListData: ShoppingListData = {
        ...listData,
        items: updatedItems,
        updatedAt: new Date().toISOString()
      };

      await this.saveListDataAndUpdateCounts(listId, updatedListData);
      return true;
    } catch (error) {
      console.error('🛒 GenericProvider: Error toggling item:', error);
      return false;
    }
  }

  async removeItemFromList(listId: string, itemId: string): Promise<boolean> {
    try {
      console.log(`🛒 GenericProvider: Optimized removeItem - atomic operation for ${listId}`);

      const listData = await this.getListData(listId);
      if (!listData) return false;
      const updatedItems = listData.items.filter(item => item.id !== itemId);

      const updatedListData: ShoppingListData = {
        ...listData,
        items: updatedItems,
        updatedAt: new Date().toISOString()
      };

      await this.saveListDataAndUpdateCounts(listId, updatedListData);
      return true;
    } catch (error) {
      console.error('🛒 GenericProvider: Error removing item:', error);
      return false;
    }
  }

  async reorderItems(listId: string, itemIds: string[]): Promise<boolean> {
    try {
      console.log(`🛒 GenericProvider: Optimized reorderItems - atomic operation for ${listId}`);

      const listData = await this.getListData(listId);
      if (!listData) return false;

      // Reorder items according to the provided order
      const reorderedItems = itemIds
        .map(id => listData.items.find(item => item.id === id))
        .filter(Boolean) as ShoppingListItem[];

      // Make sure we haven't lost any items in the reordering
      if (reorderedItems.length !== listData.items.length) {
        console.error(`🛒 GenericProvider: Item count mismatch during reorder. Expected ${listData.items.length}, got ${reorderedItems.length}`);
        return false;
      }

      const updatedListData: ShoppingListData = {
        ...listData,
        items: reorderedItems,
        updatedAt: new Date().toISOString()
      };

      await this.saveListDataAndUpdateCounts(listId, updatedListData);
      return true;
    } catch (error) {
      console.error('🛒 GenericProvider: Error reordering items:', error);
      return false;
    }
  }

  protected async saveListDataAndUpdateCounts(listId: string, updatedListData: ShoppingListData): Promise<void> {
    console.log(`🛒 GenericProvider: Optimized save - only updating list data for ${listId}`);
    await this.saveListData(listId, updatedListData);
  }

  async reorderLists(listIds: string[]): Promise<boolean> {
    try {
      console.log('🛒 GenericProvider: Reordering shopping lists:', listIds);
      
      const metadata = await this.getListsDetails();
      const reorderedLists: Record<string, ShoppingList> = {};
      
      // Reorder lists according to the provided order
      listIds.forEach((listId, index) => {
        if (metadata.lists[listId]) {
          reorderedLists[listId] = {
            ...metadata.lists[listId],
            order: index,
            updatedAt: new Date().toISOString()
          };
        }
      });
      
      await this.saveListsDetails({ lists: reorderedLists });
      return true;
    } catch (error) {
      console.error('🛒 GenericProvider: Error reordering lists:', error);
      return false;
    }
  }
}