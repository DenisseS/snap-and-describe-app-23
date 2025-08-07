QueryEngine.ts:26 QueryEngine: Executing hybrid search for: man
HybridSearchEngine.ts:58 HybridSearchEngine: Executing search for: man
HybridSearchEngine.ts:59 HybridSearchEngine: Normalized query: man
SearchStrategyChain.ts:29 Executing strategy: exact
SearchStrategyChain.ts:29 Executing strategy: starts_with
SearchStrategyChain.ts:34 Strategy starts_with found 2 results
HybridSearchEngine.ts:64 HybridSearchEngine: Found 2 total results
QueryEngine.ts:36 QueryEngine: Search found 2 results
useProductSearch.ts:78 🔍 Product search for "man": 2 results
ShoppingListDetailPage.tsx:46 🛒 ShoppingListDetailPage: Product selected: Mango
ShoppingListDetailPage.tsx:97 🛒 ShoppingListDetailPage: Adding item optimistically: Mango
useShoppingListDetail.ts:67 🛒 useShoppingListDetail: Adding item to list lista-numerica-1754235005864-r0sk: Mango {productId: 'mango_019', slug: 'mango'}
ShoppingListService.ts:86 🛒 ShoppingListService: Adding item to list lista-numerica-1754235005864-r0sk: Mango {productId: 'mango_019', slug: 'mango'}
ShoppingListService.ts:39 🛒 ShoppingListService: Using RemoteProvider
GenericShoppingListProvider.ts:151 🛒 GenericProvider: Optimized addItem - atomic operation for lista-numerica-1754235005864-r0sk
RemoteShoppingListProvider.ts:53 🛒 RemoteProvider: Using local cache for list lista-numerica-1754235005864-r0sk
GenericShoppingListProvider.ts:168 🛒 GenericProvider: Adding item with product data: {name: 'Mango', productId: 'mango_019', slug: 'mango'}
GenericShoppingListProvider.ts:308 🛒 GenericProvider: Optimized save - only updating list data for lista-numerica-1754235005864-r0sk
RemoteShoppingListProvider.ts:126 🛒 RemoteProvider: Saving list lista-numerica-1754235005864-r0sk data optimistically
SessionService.ts:36 📦 Local cache saved: LOCAL_LIST_DATA_lista-numerica-1754235005864-r0sk
SessionService.ts:227 📁 SessionService: Fire-and-forget update for /shopping-list-lista-numerica-1754235005864-r0sk.json...
useShoppingListDetail.ts:95 🛒 useShoppingListDetail: Item added successfully, trusting optimistic update
SessionService.ts:247 📁 SessionService: Background sync successful for /shopping-list-lista-numerica-1754235005864-r0sk.json
ShoppingListDetailPage.tsx:148 🛒 ShoppingListDetailPage: Reordering items: (7) ['temp-1754375178913-2c4364qxc', 'temp-1754375124507-sjumm9ntj', 'item_1754374467814_c8ni2z02o', 'temp-1754375125313-tqropu8oi', 'temp-1754375126739-a78qy413b', 'temp-1754375127528-fwau3imir', 'temp-1754375128831-v8wxxg9lj']
useShoppingListDetail.ts:215 🛒 useShoppingListDetail: Reordering items optimistically: (7) ['temp-1754375178913-2c4364qxc', 'temp-1754375124507-sjumm9ntj', 'item_1754374467814_c8ni2z02o', 'temp-1754375125313-tqropu8oi', 'temp-1754375126739-a78qy413b', 'temp-1754375127528-fwau3imir', 'temp-1754375128831-v8wxxg9lj']
ShoppingListService.ts:106 🛒 ShoppingListService: Reordering items in list lista-numerica-1754235005864-r0sk: (7) ['temp-1754375178913-2c4364qxc', 'temp-1754375124507-sjumm9ntj', 'item_1754374467814_c8ni2z02o', 'temp-1754375125313-tqropu8oi', 'temp-1754375126739-a78qy413b', 'temp-1754375127528-fwau3imir', 'temp-1754375128831-v8wxxg9lj']
ShoppingListService.ts:39 🛒 ShoppingListService: Using RemoteProvider
GenericShoppingListProvider.ts:277 🛒 GenericProvider: Optimized reorderItems - atomic operation for lista-numerica-1754235005864-r0sk
RemoteShoppingListProvider.ts:53 🛒 RemoteProvider: Using local cache for list lista-numerica-1754235005864-r0sk
GenericShoppingListProvider.ts:289 🛒 GenericProvider: Item count mismatch during reorder. Expected 7, got 1
reorderItems @ GenericShoppingListProvider.ts:289
await in reorderItems
reorderItems @ ShoppingListService.ts:107
reorderItems @ useShoppingListDetail.ts:229
handleReorder @ ShoppingListDetailPage.tsx:149
handleDragEnd @ DragDropShoppingList.tsx:243
(anonymous) @ chunk-XZJKUEL4.js?v=361347e5:2795
batchedUpdates$1 @ chunk-QT63QQJV.js?v=361347e5:18913
handler @ chunk-XZJKUEL4.js?v=361347e5:2783
handleEnd @ chunk-XZJKUEL4.js?v=361347e5:1389
useShoppingListDetail.ts:233 🛒 useShoppingListDetail: Reorder failed, but trusting optimistic update
(anonymous) @ useShoppingListDetail.ts:233
Promise.then
reorderItems @ useShoppingListDetail.ts:229
handleReorder @ ShoppingListDetailPage.tsx:149
handleDragEnd @ DragDropShoppingList.tsx:243
(anonymous) @ chunk-XZJKUEL4.js?v=361347e5:2795
batchedUpdates$1 @ chunk-QT63QQJV.js?v=361347e5:18913
handler @ chunk-XZJKUEL4.js?v=361347e5:2783
handleEnd @ chunk-XZJKUEL4.js?v=361347e5:1389
