import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  buyDigitalProduct,
  claimFreeDigitalProduct,
  fetchDigitalProductContent,
  fetchDigitalProducts,
} from '../lib/digitalProducts';
import { SHOW_ONLY_FREE_DIGITAL } from '../lib/storeRules';
import { dark } from '../lib/theme';
import type { DigitalProductCategory, DigitalProductContent, DigitalProductWithStatus } from '../lib/types';

const CATEGORY_ORDER: DigitalProductCategory[] = [
  'workout_guides',
  'nutrition_guides',
  'training_programmes',
  'transformation_plans',
  'beginner_guides',
  'weight_loss',
];

const CATEGORY_LABELS: Record<DigitalProductCategory, string> = {
  workout_guides: 'Workout Guides',
  nutrition_guides: 'Nutrition Guides',
  training_programmes: 'Training Programmes',
  transformation_plans: 'Transformation Plans',
  beginner_guides: 'Beginner Guides',
  weight_loss: 'Weight Loss Guides',
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function DigitalProductsScreen() {
  const [products, setProducts] = useState<DigitalProductWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, DigitalProductContent | null>>({});
  const [contentLoading, setContentLoading] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProducts(await fetchDigitalProducts());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const sections = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: products.filter((p) => p.category === category),
    })).filter((s) => s.items.length > 0);
  }, [products]);

  const toggleExpand = async (product: DigitalProductWithStatus) => {
    if (expandedId === product.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(product.id);
    if (product.owned && content[product.id] === undefined) {
      setContentLoading(true);
      try {
        const c = await fetchDigitalProductContent(product.id);
        setContent((prev) => ({ ...prev, [product.id]: c }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setContentLoading(false);
      }
    }
  };

  const handleBuy = async (product: DigitalProductWithStatus) => {
    setBuyingId(product.id);
    setError(null);
    try {
      if (product.price_cents === 0) {
        // Free: no checkout. The server adds it to the library, then it opens.
        await claimFreeDigitalProduct(product.id);
        await load();
        setBuyingId(null);
        return;
      }
      await buyDigitalProduct(product.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBuyingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{SHOW_ONLY_FREE_DIGITAL ? 'Free Guides' : 'Guides & Plans'}</Text>
      <Text style={styles.subtitle}>
        {SHOW_ONLY_FREE_DIGITAL
          ? 'Free guides and programmes. Tap Get free to add one to your library.'
          : 'One-time downloads: meal plans, transformation programs, and training guides.'}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {sections.length === 0 && (
        <Text style={styles.empty}>Nothing available yet — check back soon.</Text>
      )}

      {sections.map((section) => (
        <View key={section.category} style={styles.section}>
          <Text style={styles.sectionTitle}>{CATEGORY_LABELS[section.category]}</Text>

          {section.items.map((item) => {
            const expanded = expandedId === item.id;
            const productContent = content[item.id];

            return (
              <View key={item.id} style={styles.card}>
                <Pressable onPress={() => toggleExpand(item)}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    {!item.owned && <Text style={styles.cardPrice}>{item.price_cents === 0 ? 'Free' : formatPrice(item.price_cents)}</Text>}
                  </View>
                  {item.description ? <Text style={styles.cardDescription}>{item.description}</Text> : null}
                </Pressable>

                {!item.owned ? (
                  <Pressable
                    style={styles.buyButton}
                    onPress={() => handleBuy(item)}
                    disabled={buyingId === item.id}
                  >
                    {buyingId === item.id ? (
                      <ActivityIndicator color="#0a0a0a" size="small" />
                    ) : (
                      <Text style={styles.buyButtonText}>
                        {item.price_cents === 0 ? 'Get free' : `Buy — ${formatPrice(item.price_cents)}`}
                      </Text>
                    )}
                  </Pressable>
                ) : expanded ? (
                  contentLoading ? (
                    <ActivityIndicator style={{ marginTop: 12 }} color={dark.accent} />
                  ) : (
                    <View style={styles.contentBox}>
                      {productContent?.body ? (
                        <Text style={styles.contentText}>{productContent.body}</Text>
                      ) : null}
                      {productContent?.file_url ? (
                        <Pressable onPress={() => Linking.openURL(productContent.file_url)}>
                          <Text style={styles.fileLink}>⬇ Download</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )
                ) : (
                  <Pressable onPress={() => toggleExpand(item)}>
                    <Text style={styles.ownedHint}>✓ Owned — tap to view</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
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
  },
  error: {
    color: dark.danger,
    marginBottom: 12,
  },
  empty: {
    color: dark.textFaint,
    textAlign: 'center',
    marginTop: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.text,
    marginBottom: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    color: dark.text,
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: dark.accent,
  },
  cardDescription: {
    fontSize: 13,
    color: dark.textMuted,
    marginTop: 6,
  },
  buyButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  buyButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
  },
  ownedHint: {
    color: dark.accent,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 10,
  },
  contentBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    paddingTop: 12,
  },
  contentText: {
    fontSize: 14,
    color: dark.text,
    lineHeight: 20,
  },
  fileLink: {
    color: dark.accent,
    fontWeight: '600',
    marginTop: 10,
  },
});
