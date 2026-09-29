const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function plainText(html = '') {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readAudibleBook(asin: string) {
  const catalogUrl = `https://api.audible.com/1.0/catalog/products/${asin}?response_groups=contributors,product_desc,product_extended_attrs,media`;
  const chaptersUrl = `https://api.audible.com/1.0/content/${asin}/metadata?response_groups=chapter_info`;
  const [catalogResponse, chaptersResponse] = await Promise.all([fetch(catalogUrl), fetch(chaptersUrl)]);
  if (!catalogResponse.ok || !chaptersResponse.ok) throw new Error('Audible book unavailable');
  const product = (await catalogResponse.json()).product;
  const chapterInfo = (await chaptersResponse.json()).content_metadata?.chapter_info;
  if (!product?.title || !chapterInfo?.chapters?.length) throw new Error('Audible book details unavailable');
  return {
    asin,
    url: `https://www.audible.com/pd/${asin}`,
    name: product.title,
    subtitle: product.subtitle || '',
    description: plainText(product.publisher_summary || product.merchandising_summary || ''),
    image: product.product_images?.['500'] || product.product_images?.['300'] || '',
    authors: (product.authors || []).map((author: any) => author.name).filter(Boolean),
    narrators: (product.narrators || []).map((narrator: any) => narrator.name).filter(Boolean),
    publisher: product.publisher_name || '',
    releaseDate: product.release_date || product.publication_datetime || product.issue_date || '',
    runtimeMinutes: product.runtime_length_min || Math.round((chapterInfo.runtime_length_ms || 0) / 60000),
    chapters: chapterInfo.chapters.map((chapter: any, index: number) => ({
      id: `${asin}-${index + 1}`,
      title: chapter.title || `Chapter ${index + 1}`,
      lengthMs: chapter.length_ms || 0,
      comments: [],
    })),
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { asin } = await request.json();
    if (!/^[A-Z0-9]{10}$/i.test(String(asin || ''))) throw new Error('A valid Audible ASIN is required');
    const book = await readAudibleBook(String(asin).toUpperCase());
    return new Response(JSON.stringify(book), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Audible book lookup failed' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
