
import { ShoppingList, ShoppingListData } from '@/types/shoppingList';
import SessionService from '@/services/SessionService';
import { GenericShoppingListProvider } from './GenericShoppingListProvider';
import { SHOPPING_LIST_CACHE_KEYS } from '@/constants/cacheKeys';
import { QueueClient } from '@/services/sw/QueueClient';

export class RemoteShoppingListProvider extends GenericShoppingListProvider {
  constructor(sessionService: SessionService) {
    super(sessionService);
  }

  // Cache local como fuente de verdad - igual que LocalProvider
  protected async getListsDetails_deprecated(): Promise<{ lists: Record<string, ShoppingList> }> {
    // Primero intentar cache local
    const localData = this.sessionService.getLocalFile(SHOPPING_LIST_CACHE_KEYS.LOCAL_SHOPPING_LISTS);
    
    if (localData) {
      console.log('🛒 RemoteProvider: Using local cache for lists metadata');
      return localData;
    }

    // Si no hay cache local, intentar cargar de remoto
    console.log('🛒 RemoteProvider: Loading lists metadata from remote');
    const result = await this.sessionService.getFile(SHOPPING_LIST_CACHE_KEYS.REMOTE_SHOPPING_LISTS_PATH);
    const profileData = result.data || { lists: {} };
    
    // Guardar en cache local para próximas veces
    const listsData = { lists: profileData.shoppingLists || {} };
    this.sessionService.setLocalFile(SHOPPING_LIST_CACHE_KEYS.LOCAL_SHOPPING_LISTS, listsData);
    
    return listsData;
  }

  // Nueva implementación con sync
  protected async getListsDetails(): Promise<{ lists: Record<string, ShoppingList> }> {
    // Primero intentar cache local
    const localData = this.sessionService.getLocalFile(SHOPPING_LIST_CACHE_KEYS.LOCAL_SHOPPING_LISTS);
    
    if (localData) {
      console.log('🛒 RemoteProvider: Using local cache for lists metadata');
      return localData;
    }

    // Si no hay cache local, cargar de remoto con sync
    console.log('🛒 RemoteProvider: Loading lists metadata from remote with sync');
    const result = await this.sessionService.getFile(SHOPPING_LIST_CACHE_KEYS.REMOTE_SHOPPING_LISTS_PATH);
    const profileData = result.data || { lists: {} };
    
    // Guardar en cache local para próximas veces
    const listsData = { lists: profileData.shoppingLists || {} };
    this.sessionService.setLocalFile(SHOPPING_LIST_CACHE_KEYS.LOCAL_SHOPPING_LISTS, listsData);
    
    return listsData;
  }

  // Update inmediato del cache local + background sync
  protected async saveListsDetails(metadata: { lists: Record<string, ShoppingList> }): Promise<void> {
    console.log('🛒 RemoteProvider: Saving lists metadata optimistically');
    
    // 1. Update cache local inmediato (igual que LocalProvider)
    this.sessionService.setLocalFile(SHOPPING_LIST_CACHE_KEYS.LOCAL_SHOPPING_LISTS, metadata);

    // 2. Background sync fire-and-forget
    const profileData = { shoppingLists: metadata.lists };
    this.sessionService.updateFile(SHOPPING_LIST_CACHE_KEYS.REMOTE_SHOPPING_LISTS_PATH, profileData);
  }

  // Cache local como fuente de verdad con sync handler
  protected async getListData(listId: string): Promise<ShoppingListData | null> {
    // Primero intentar cache local
    const localKey = `${SHOPPING_LIST_CACHE_KEYS.LOCAL_LIST_DATA_PREFIX}${listId}`;
    const localData = this.sessionService.getLocalFile(localKey);
    
    if (localData) {
      console.log(`🛒 RemoteProvider: Using local cache for list ${listId}`);
      return localData;
    }

    // Si no hay cache local, intentar cargar de remoto
    console.log(`🛒 RemoteProvider: Loading list ${listId} from remote`);
    const result = await this.sessionService.getFile(`${SHOPPING_LIST_CACHE_KEYS.REMOTE_LIST_PREFIX}${listId}.json`);
    
    if (result.data) {
      // Guardar en cache local para próximas veces
      this.sessionService.setLocalFile(localKey, result.data);
    }
    
    return result.data;
  }

  // Override del método getShoppingLists para añadir syncHandler
  async getShoppingLists(): Promise<{
    data: Record<string, ShoppingList>;
    state: any;
    syncHandler?: (onUpdate: (data: Record<string, ShoppingList>) => void, onSyncStatusChange: (isSyncing: boolean) => void) => void;
  }> {
    const result = await super.getShoppingLists();
    
    // Si hay data de cache, añadir sync handler
    if (result.data && Object.keys(result.data).length > 0) {
      return {
        ...result,
        syncHandler: (onUpdate, onSyncStatusChange) => {
          this.performListsMetadataSync(onUpdate, onSyncStatusChange);
        }
      };
    }
    
    return result;
  }

  // Override del método para añadir syncHandler
  async getShoppingListData(listId: string): Promise<{
    data: ShoppingListData | null;
    state: any;
    syncHandler?: (onUpdate: (data: ShoppingListData) => void, onSyncStatusChange: (isSyncing: boolean) => void) => void;
  }> {
    const result = await super.getShoppingListData(listId);
    
    // Si hay data de cache, añadir sync handler
    if (result.data) {
      return {
        ...result,
        syncHandler: (onUpdate, onSyncStatusChange) => {
          this.performListSync(listId, onUpdate, onSyncStatusChange);
        }
      };
    }
    
    return result;
  }

  // Sincronización específica para metadata de listas  
  private async performListsMetadataSync(
    onUpdate: (data: Record<string, ShoppingList>) => void,
    onSyncStatusChange: (isSyncing: boolean) => void
  ): Promise<void> {
    console.log('🛒 RemoteProvider: Starting background sync for lists metadata...');
    onSyncStatusChange(true);

    try {
      const filePath = SHOPPING_LIST_CACHE_KEYS.REMOTE_SHOPPING_LISTS_PATH;
      const result = await this.sessionService.getFile(filePath);
      
      if (result.syncHandler) {
        result.syncHandler(
          (updatedProfileData) => {
            console.log('🛒 RemoteProvider: Lists metadata updated from remote sync');
            // Actualizar cache local
            const listsData = { lists: updatedProfileData.shoppingLists || {} };
            this.sessionService.setLocalFile(SHOPPING_LIST_CACHE_KEYS.LOCAL_SHOPPING_LISTS, listsData);
            // Notificar a la UI
            onUpdate(listsData.lists);
          },
          onSyncStatusChange
        );
      } else {
        onSyncStatusChange(false);
      }
    } catch (error) {
      console.error('🛒 RemoteProvider: Error in lists metadata sync:', error);
      onSyncStatusChange(false);
    }
  }

  // Sincronización específica para listas
  private async performListSync(
    listId: string,
    onUpdate: (data: ShoppingListData) => void,
    onSyncStatusChange: (isSyncing: boolean) => void
  ): Promise<void> {
    console.log(`🛒 RemoteProvider: Starting background sync for list ${listId}...`);
    onSyncStatusChange(true);

    try {
      const filePath = `${SHOPPING_LIST_CACHE_KEYS.REMOTE_LIST_PREFIX}${listId}.json`;
      const result = await this.sessionService.getFile(filePath);
      
      if (result.syncHandler) {
        result.syncHandler(
          (updatedData) => {
            console.log(`🛒 RemoteProvider: List ${listId} updated from remote sync`);
            // Actualizar cache local
            const localKey = `${SHOPPING_LIST_CACHE_KEYS.LOCAL_LIST_DATA_PREFIX}${listId}`;
            this.sessionService.setLocalFile(localKey, updatedData);
            // Notificar a la UI
            onUpdate(updatedData);
          },
          onSyncStatusChange
        );
      } else {
        onSyncStatusChange(false);
      }
    } catch (error) {
      console.error(`🛒 RemoteProvider: Error in list sync for ${listId}:`, error);
      onSyncStatusChange(false);
    }
  }

  // Update inmediato del cache local + background sync
  protected async saveListData(listId: string, data: ShoppingListData): Promise<void> {
    console.log(`🛒 RemoteProvider: Saving list ${listId} data optimistically`);
    
    // 1. Update cache local inmediato (igual que LocalProvider)
    const localKey = `${SHOPPING_LIST_CACHE_KEYS.LOCAL_LIST_DATA_PREFIX}${listId}`;
    this.sessionService.setLocalFile(localKey, data);

    // 2. Enqueue to Service Worker generic queue (fire-and-forget)
    QueueClient.getInstance().enqueue('shopping-lists', listId, data);
  }

  protected async deleteListData(listId: string): Promise<void> {
    console.log(`🛒 RemoteProvider: Deleting list ${listId} optimistically`);
    
    // 1. Clear cache local inmediato
    const localKey = `${SHOPPING_LIST_CACHE_KEYS.LOCAL_LIST_DATA_PREFIX}${listId}`;
    this.sessionService.clearCache(localKey);

    // 2. Background delete
    await this.sessionService.deleteFile(`${SHOPPING_LIST_CACHE_KEYS.REMOTE_LIST_PREFIX}${listId}.json`);
  }

  async mergeLocalListsWithRemote(): Promise<{ success: boolean }> {
    console.log('🛒 RemoteProvider: Starting merge of local lists with remote');

    try {
      // Get local data
      const localMetadata = this.sessionService.getLocalFile(SHOPPING_LIST_CACHE_KEYS.LOCAL_SHOPPING_LISTS) || { lists: {} };
      
      if (Object.keys(localMetadata.lists).length === 0) {
        console.log('🛒 RemoteProvider: No local lists to merge');
        return { success: true };
      }

      console.log(`🛒 RemoteProvider: Found ${Object.keys(localMetadata.lists).length} local lists to merge`);

      // Update remote usando el nuevo patrón simplificado
      await this.saveListsDetails(localMetadata);

      // Upload individual list data files
      for (const listId of Object.keys(localMetadata.lists)) {
        const localListData = this.sessionService.getLocalFile(`${SHOPPING_LIST_CACHE_KEYS.LOCAL_LIST_DATA_PREFIX}${listId}`);
        if (localListData) {
          await this.saveListData(listId, localListData);
        }
      }

      console.log('🛒 RemoteProvider: Merge completed successfully');
      return { success: true };
    } catch (error) {
      console.error('🛒 RemoteProvider: Merge failed:', error);
      return { success: false };
    }
  }
}
