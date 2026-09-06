import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCart } from '../lib/cartContext';
import { buyCart, fetchMerchCatalog, fetchMyMerchOrders } from '../lib/merch';
import { dark } from '../lib/theme';
import type { MerchOrder, MerchProduct } from '../lib/types';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Payment received',
  submitted: 'Sent to production',
  fulfilled: 'Shipped',
  failed: 'Something went wrong — we\'ll follow up',
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function priceRange(product: MerchProduct): string {
  const available = product.variants.filter((v) => v.available);
  if (available.length === 0) return '';
  const prices = available.map((v) => v.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`;
}

export default function MerchScreen() {
  const [products, setProducts] = useState<MerchProduct[]>([]);
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickViewId, setQuickViewId] = useState<number | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [addedId, setAddedId] = useState<number | null>(null);

  const cart = useCart();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [catalog, myOrders] = await Promise.all([fetchMerchCatalog(), fetchMyMerchOrders()]);
      setProducts(catalog);
      setOrders(myOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleAddToCart = (product: MerchProduct) => {
    const variantId = selectedVariant[product.id] ?? product.variants.find((v) => v.available)?.syncVariantId;
    const variant = product.variants.find((v) => v.syncVariantId === variantId);
    if (!variant) return;

    cart.addItem({
      productId: product.id,
      syncVariantId: variant.syncVariantId,
      productName: product.name,
      thumbnailUrl: product.thumbnailUrl,
      size: variant.size,
      color: variant.color,
      priceCents: variant.priceCents,
    });
    setAddedId(product.id);
    setTimeout(() => setAddedId((id) => (id === product.id ? null : id)), 1400);
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    setError(null);
    try {
      await buyCart(cart.items);
      cart.clearCart();
      setCartOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  const quickViewProduct = products.find((p) => p.id === quickViewId) ?? null;

  return (
    <>
    <Modal
      visible={!!quickViewProduct}
      transparent
      animationType="slide"
      onRequestClose={() => setQuickViewId(null)}
    >
      <Pressable style={styles.quickViewBackdrop} onPress={() => setQuickViewId(null)}>
        {quickViewProduct && (
          <Pressable style={styles.quickViewSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.quickViewHandle} />
            <View style={styles.quickViewImageWrap}>
              {quickViewProduct.thumbnailUrl ? (
                <Image
                  source={{ uri: quickViewProduct.thumbnailUrl }}
                  style={styles.quickViewImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.thumbnailPlaceholder} />
              )}
            </View>

            <ScrollView contentContainerStyle={styles.quickViewBody}>
              <Text style={styles.quickViewName}>{quickViewProduct.name}</Text>
              <Text style={styles.quickViewPrice}>
                {(() => {
                  const chosen = quickViewProduct.variants.find(
                    (v) => v.syncVariantId === selectedVariant[quickViewProduct.id]
                  );
                  return chosen ? formatPrice(chosen.priceCents) : priceRange(quickViewProduct);
                })()}
              </Text>

              <Text style={styles.quickViewLabel}>Size / Color</Text>
              <View style={styles.variantRow}>
                {quickViewProduct.variants.map((variant) => {
                  const selected = selectedVariant[quickViewProduct.id] === variant.syncVariantId;
                  return (
                    <Pressable
                      key={variant.syncVariantId}
                      style={[
                        styles.variantChip,
                        selected && styles.variantChipSelected,
                        !variant.available && styles.variantChipDisabled,
                      ]}
                      onPress={() =>
                        variant.available &&
                        setSelectedVariant((s) => ({ ...s, [quickViewProduct.id]: variant.syncVariantId }))
                      }
                      disabled={!variant.available}
                    >
                      <Text style={[styles.variantChipText, selected && styles.variantChipTextSelected]}>
                        {variant.size} / {variant.color}
                        {!variant.available ? ' (sold out)' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[styles.buyButton, addedId === quickViewProduct.id && styles.buyButtonAdded]}
                onPress={() => handleAddToCart(quickViewProduct)}
                disabled={!quickViewProduct.variants.some((v) => v.available)}
              >
                <Text style={styles.buyButtonText}>
                  {addedId === quickViewProduct.id
                    ? '✓ Added to Cart'
                    : `Add to Cart — ${formatPrice(
                        quickViewProduct.variants.find((v) => v.syncVariantId === selectedVariant[quickViewProduct.id])
                          ?.priceCents ?? quickViewProduct.variants.find((v) => v.available)?.priceCents ?? 0
                      )}`}
                </Text>
              </Pressable>

              <Pressable style={styles.quickViewClose} onPress={() => setQuickViewId(null)}>
                <Text style={styles.quickViewCloseText}>Close</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        )}
      </Pressable>
    </Modal>

    <Modal visible={cartOpen} animationType="slide" onRequestClose={() => setCartOpen(false)}>
      <View style={styles.cartContainer}>
        <View style={styles.cartHeader}>
          <Text style={styles.cartTitle}>Your Cart</Text>
          <Pressable onPress={() => setCartOpen(false)}>
            <Text style={styles.cartClose}>Close</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {cart.items.length === 0 ? (
          <Text style={styles.empty}>Your cart is empty.</Text>
        ) : (
          <FlatList
            data={cart.items}
            keyExtractor={(item) => String(item.syncVariantId)}
            contentContainerStyle={styles.cartList}
            renderItem={({ item }) => (
              <View style={styles.cartRow}>
                {item.thumbnailUrl ? (
                  <Image source={{ uri: item.thumbnailUrl }} style={styles.cartThumbnail} />
                ) : (
                  <View style={styles.cartThumbnail} />
                )}
                <View style={styles.cartRowInfo}>
                  <Text style={styles.cartRowName}>{item.productName}</Text>
                  <Text style={styles.cartRowVariant}>{item.size} / {item.color}</Text>
                  <Text style={styles.cartRowPrice}>{formatPrice(item.priceCents)} each</Text>
                </View>
                <View style={styles.cartQtyControls}>
                  <Pressable
                    style={styles.cartQtyButton}
                    onPress={() => cart.updateQuantity(item.syncVariantId, item.quantity - 1)}
                  >
                    <Text style={styles.cartQtyButtonText}>−</Text>
                  </Pressable>
                  <Text style={styles.cartQtyValue}>{item.quantity}</Text>
                  <Pressable
                    style={styles.cartQtyButton}
                    onPress={() => cart.updateQuantity(item.syncVariantId, item.quantity + 1)}
                  >
                    <Text style={styles.cartQtyButtonText}>+</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => cart.removeItem(item.syncVariantId)}>
                  <Text style={styles.cartRemove}>Remove</Text>
                </Pressable>
              </View>
            )}
          />
        )}

        {cart.items.length > 0 && (
          <View style={styles.cartFooter}>
            <View style={styles.cartTotalRow}>
              <Text style={styles.cartTotalLabel}>Total</Text>
              <Text style={styles.cartTotalValue}>{formatPrice(cart.totalCents)}</Text>
            </View>
            <Pressable style={styles.buyButton} onPress={handleCheckout} disabled={checkingOut}>
              {checkingOut ? (
                <ActivityIndicator color="#0a0a0a" />
              ) : (
                <Text style={styles.buyButtonText}>Checkout</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </Modal>

    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      ListHeaderComponent={
        <>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Merch</Text>
              <Text style={styles.subtitle}>Official FitNFree gear, shipped straight to your door.</Text>
            </View>
            <Pressable style={styles.cartButton} onPress={() => setCartOpen(true)}>
              <Text style={styles.cartButtonText}>🛒 Cart</Text>
              {cart.totalCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cart.totalCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}

          {orders.length > 0 && (
            <Pressable style={styles.ordersToggle} onPress={() => setOrdersOpen((o) => !o)}>
              <Text style={styles.ordersToggleText}>
                📦 My Orders ({orders.length})
              </Text>
              <Text style={styles.ordersToggleChevron}>{ordersOpen ? '▲' : '▼'}</Text>
            </Pressable>
          )}
          {orders.length > 0 && ordersOpen && (
            <View style={styles.ordersList}>
              {orders.map((order) => (
                <View key={order.id} style={styles.orderRow}>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderItem}>
                      {order.items.map((i) => i.name).join(', ')}
                    </Text>
                    <Text style={styles.orderStatus}>{STATUS_LABEL[order.status] ?? order.status}</Text>
                  </View>
                  <Text style={styles.orderPrice}>{formatPrice(order.amount_cents)}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Shop</Text>
        </>
      }
      data={products}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>No merch available yet — check back soon.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.gridCard} onPress={() => setQuickViewId(item.id)}>
          <View style={styles.gridImageWrap}>
            {item.thumbnailUrl ? (
              <Image source={{ uri: item.thumbnailUrl }} style={styles.gridImage} resizeMode="contain" />
            ) : (
              <View style={styles.thumbnailPlaceholder} />
            )}
            <Pressable style={styles.gridAddButton} onPress={() => setQuickViewId(item.id)}>
              <Text style={styles.gridAddButtonText}>+</Text>
            </Pressable>
          </View>
          <View style={styles.gridInfo}>
            <Text style={styles.gridName} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.gridPrice}>{priceRange(item)}</Text>
          </View>
        </Pressable>
      )}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: dark.background,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: dark.text,
  },
  subtitle: {
    fontSize: 13,
    color: dark.textFaint,
    marginTop: 4,
    marginBottom: 16,
    maxWidth: 240,
  },
  cartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cartButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: dark.text,
  },
  cartBadge: {
    marginLeft: 6,
    backgroundColor: dark.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#0a0a0a',
    fontSize: 11,
    fontWeight: '700',
  },
  error: {
    color: dark.danger,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.text,
    marginTop: 8,
    marginBottom: 8,
  },
  empty: {
    color: dark.textFaint,
    textAlign: 'center',
    marginTop: 12,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  orderInfo: {
    flex: 1,
    paddingRight: 8,
  },
  orderItem: {
    fontSize: 13,
    fontWeight: '700',
    color: dark.text,
  },
  orderStatus: {
    fontSize: 12,
    color: dark.textMuted,
    marginTop: 2,
  },
  orderPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: dark.textMuted,
  },
  ordersToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  ordersToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: dark.text,
  },
  ordersToggleChevron: {
    fontSize: 11,
    color: dark.textFaint,
  },
  ordersList: {
    marginBottom: 4,
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: dark.surfaceElevated,
  },
  gridRow: {
    gap: 12,
  },
  gridCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  gridImageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#f4f3ee',
    padding: 12,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridAddButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  gridAddButtonText: {
    color: '#0a0a0a',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  gridInfo: {
    padding: 10,
  },
  gridName: {
    fontSize: 13,
    fontWeight: '700',
    color: dark.text,
    minHeight: 34,
  },
  gridPrice: {
    fontSize: 13,
    color: dark.accent,
    fontWeight: '700',
    marginTop: 4,
  },
  variantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  variantChip: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  variantChipSelected: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  variantChipDisabled: {
    opacity: 0.4,
  },
  variantChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: dark.text,
  },
  variantChipTextSelected: {
    color: '#0a0a0a',
  },
  buyButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buyButtonAdded: {
    backgroundColor: '#4d7c0f',
  },
  buyButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
  },
  quickViewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  quickViewSheet: {
    backgroundColor: dark.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  quickViewHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: dark.border,
    marginTop: 10,
    marginBottom: 6,
  },
  quickViewImageWrap: {
    width: '100%',
    height: 220,
    backgroundColor: '#f4f3ee',
    padding: 16,
  },
  quickViewImage: {
    width: '100%',
    height: '100%',
  },
  quickViewBody: {
    padding: 20,
    paddingBottom: 32,
  },
  quickViewName: {
    fontSize: 18,
    fontWeight: '700',
    color: dark.text,
  },
  quickViewPrice: {
    fontSize: 16,
    color: dark.accent,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 16,
  },
  quickViewLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: dark.textMuted,
    marginBottom: 8,
  },
  quickViewClose: {
    alignItems: 'center',
    marginTop: 14,
  },
  quickViewCloseText: {
    color: dark.textFaint,
    fontSize: 13,
    fontWeight: '600',
  },
  cartContainer: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
    backgroundColor: dark.background,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cartTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: dark.text,
  },
  cartClose: {
    color: dark.accent,
    fontWeight: '600',
    fontSize: 15,
  },
  cartList: {
    paddingBottom: 20,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
    paddingVertical: 12,
  },
  cartThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: dark.surfaceElevated,
  },
  cartRowInfo: {
    flex: 1,
  },
  cartRowName: {
    fontSize: 13,
    fontWeight: '700',
    color: dark.text,
  },
  cartRowVariant: {
    fontSize: 12,
    color: dark.textMuted,
    marginTop: 1,
  },
  cartRowPrice: {
    fontSize: 12,
    color: dark.textFaint,
    marginTop: 1,
  },
  cartQtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cartQtyButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartQtyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.text,
  },
  cartQtyValue: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 18,
    textAlign: 'center',
    color: dark.text,
  },
  cartRemove: {
    color: dark.danger,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: dark.border,
    paddingTop: 16,
    paddingBottom: 24,
  },
  cartTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cartTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: dark.text,
  },
  cartTotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: dark.accent,
  },
});
