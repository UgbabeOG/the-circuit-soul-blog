

import React, { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { GoogleGenAI } from "@google/genai";
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

// Define the structure of a blog post
interface Post {
  slug: string;
  title: string;
  content: string;
  category: string;
  imageUrl: string;
  sources: Array<{
    uri: string;
    title: string;
  }>;
  createdAt: number; // Timestamp for time-based filtering
}

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // FIX: Replaced constructor with a state property initializer to resolve type errors.
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-white bg-red-800 p-4 rounded-md m-4">
          <h2 className="text-xl font-bold mb-2">Something went wrong.</h2>
          <p>An unexpected error occurred. Please try refreshing the page.</p>
          <pre className="mt-2 text-sm bg-red-900 p-2 rounded">{this.state.error?.toString()}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const API_KEY = process.env.API_KEY;
const CACHE_KEY = 'trendspotter_posts_v3'; // Cache versioning
const CACHE_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper to create a URL-friendly slug from a string
const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
};

// Generates a placeholder SVG image
const getPlaceholderImage = (width: number, height: number): string => {
    const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <rect width="100%" height="100%" fill="#374151"></rect>
        <style>
          .text { font-family: 'Inter', sans-serif; font-size: 1rem; fill: #9ca3af; text-anchor: middle; }
        </style>
        <text x="50%" y="50%" dy=".3em" class="text">Generating Image...</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
};

// --- SVG Icons for Sharing ---
const LinkIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
const TwitterIcon = () => <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.223.085a4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" /></svg>;
const FacebookIcon = () => <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" /></svg>;
const LinkedInIcon = () => <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>;


const ShareButtons = ({ post }: { post: Post }) => {
    const [copied, setCopied] = useState(false);
    const postUrl = `${window.location.origin}${window.location.pathname}#${post.slug}`;
    const encodedTitle = encodeURIComponent(`Check out this article: ${post.title}`);

    const handleCopy = () => {
        navigator.clipboard.writeText(postUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const shareOptions = [
        { name: 'Copy Link', icon: <LinkIcon />, action: handleCopy, isButton: true },
        { name: 'Twitter', icon: <TwitterIcon />, url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(postUrl)}&text=${encodedTitle}` },
        { name: 'Facebook', icon: <FacebookIcon />, url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}` },
        { name: 'LinkedIn', icon: <LinkedInIcon />, url: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(postUrl)}&title=${encodedTitle}` },
    ];

    return (
        <div className="mt-auto">
            <div className="mt-6 pt-4 border-t border-gray-700">
                <h4 className="text-sm font-semibold text-gray-400 mb-3">Share this post:</h4>
                <div className="flex items-center gap-4">
                    {shareOptions.map(option =>
                        option.isButton ? (
                            <button key={option.name} onClick={option.action} title={option.name} className="text-gray-400 hover:text-white transition-colors relative">
                                {copied ? <CheckIcon /> : option.icon}
                            </button>
                        ) : (
                            <a key={option.name} href={option.url} target="_blank" rel="noopener noreferrer" title={`Share on ${option.name}`} className="text-gray-400 hover:text-white transition-colors">
                                {option.icon}
                            </a>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [timeFilter, setTimeFilter] = useState<string>('All Time');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [highlightedPost, setHighlightedPost] = useState<string | null>(null);
  
  const ai = useMemo(() => {
    if (!API_KEY) return null;
    try {
      return new GoogleGenAI({ apiKey: API_KEY });
    } catch (e) {
      console.error("Failed to initialize GoogleGenAI", e);
      setError("Failed to initialize AI. Please check your API key configuration.");
      return null;
    }
  }, []);

  const categories = ['All', 'Artificial Intelligence', 'Cybersecurity', 'Cloud Computing', 'Quantum Computing', 'DeFi & Blockchain', 'DevOps'];
  const timeFilters = ['All Time', 'Today', 'This Week', 'This Month'];

  // Debounce search term
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  // Handle URL hash for deep linking and highlighting
  useEffect(() => {
    if (posts.length === 0) return;

    const handleHashChange = () => {
      const hash = window.location.hash.substring(1);
      if (hash && posts.some(p => p.slug === hash)) {
        const element = document.getElementById(hash);
        if (element) {
          setTimeout(() => {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedPost(hash);
            setTimeout(() => setHighlightedPost(null), 3000);
          }, 100);
        }
      }
    };
    
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [posts]);

  useEffect(() => {
    const fetchTrendingPosts = async (forceRefresh = false) => {
        if (!ai) {
            setError("API key not configured. Please ensure the API_KEY is set correctly.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const techTopics = {
                'Artificial Intelligence': 'the impact of large language models on creative industries',
                'Cybersecurity': 'the rise of AI-powered phishing attacks and how to defend against them',
                'Cloud Computing': 'the trend of cloud cost optimization strategies for 2024',
                'Quantum Computing': 'breakthroughs in quantum supremacy and its practical implications',
                'DeFi & Blockchain': 'the role of zero-knowledge proofs in enhancing blockchain privacy and scalability',
                'DevOps': 'the growing importance of GitOps in modern CI/CD pipelines',
            };

            const placeholderImageUrl = getPlaceholderImage(16, 9);
            const textGenerationPromises = Object.entries(techTopics).map(async ([category, topic]) => {
                const textPrompt = `Write a short, engaging blog post about "${topic}". The tone should be informative and accessible for a tech-savvy audience. Explain why this topic is currently trending. IMPORTANT: Respond with ONLY a single valid JSON object in a string with the keys "title" and "content". The content value should be in Markdown format (2-3 paragraphs).`;
                
                const textResponse = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: textPrompt,
                    config: {
                        tools: [{ googleSearch: {} }],
                    },
                });

                let postData;
                try {
                    let jsonString = textResponse.text;
                    const startIndex = jsonString.indexOf('{');
                    const endIndex = jsonString.lastIndexOf('}');
                    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
                        throw new Error("Could not find a valid JSON object in the response.");
                    }
                    jsonString = jsonString.substring(startIndex, endIndex + 1);
                    postData = JSON.parse(jsonString);
                } catch (e) {
                    console.error('Failed to parse JSON for topic:', topic, e);
                    console.error('Received text:', textResponse.text);
                    return null;
                }

                const sources = textResponse.candidates?.[0]?.groundingMetadata?.groundingChunks
                    ?.map(chunk => chunk.web)
                    .filter((web): web is { uri: string, title: string } => !!(web?.uri && web.title)) || [];

                return {
                    slug: slugify(postData.title),
                    title: postData.title,
                    content: postData.content,
                    category: category,
                    imageUrl: placeholderImageUrl,
                    sources: sources,
                    createdAt: Date.now(),
                };
            });

            const initialPosts = (await Promise.all(textGenerationPromises)).filter((p): p is Post => p !== null);
            setPosts(initialPosts);
            setLoading(false);
            localStorage.setItem(CACHE_KEY, JSON.stringify({ posts: initialPosts, timestamp: Date.now() }));

            initialPosts.forEach(async (post, index) => {
                try {
                    const imagePrompt = `A dynamic and visually appealing hero image for a tech blog post titled "${post.title}". The style should be futuristic and abstract, with a dark theme and cyan accents.`;
                    const imageResponse = await ai.models.generateImages({
                        model: 'imagen-4.0-generate-001',
                        prompt: imagePrompt,
                        config: {
                            numberOfImages: 1,
                            outputMimeType: 'image/jpeg',
                            aspectRatio: '16:9',
                        },
                    });
                    
                    const imageUrl = `data:image/jpeg;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
                    
                    setPosts(currentPosts => {
                        const updatedPosts = [...currentPosts];
                        const postIndex = updatedPosts.findIndex(p => p.slug === post.slug);
                        if (postIndex !== -1) {
                            updatedPosts[postIndex].imageUrl = imageUrl;
                            localStorage.setItem(CACHE_KEY, JSON.stringify({ posts: updatedPosts, timestamp: Date.now() }));
                            return updatedPosts;
                        }
                        return currentPosts;
                    });
                } catch (err) {
                    console.error(`Failed to generate image for "${post.title}"`, err);
                }
            });
        } catch (err) {
            console.error(err);
            setError("Failed to fetch posts from the AI. The API key might be invalid or the service may be down.");
            setLoading(false);
        }
    };

    // Stale-while-revalidate caching logic
    const loadContent = () => {
        let isStale = true;
        try {
            const cachedDataString = localStorage.getItem(CACHE_KEY);
            if (cachedDataString) {
                const cachedData = JSON.parse(cachedDataString);
                const { posts: cachedPosts, timestamp } = cachedData;
                
                if (cachedPosts && timestamp) {
                    setPosts(cachedPosts);
                    setLoading(false);
                    isStale = Date.now() - timestamp > CACHE_EXPIRATION_MS;
                }
            }
        } catch (e) {
            console.error("Failed to load posts from cache", e);
            localStorage.removeItem(CACHE_KEY);
        }

        if (isStale) {
            console.log(isStale ? "Cache is stale, revalidating in background..." : "No cache, fetching content...");
            fetchTrendingPosts();
        }
    };
    
    loadContent();
  }, [ai]);

  const filteredPosts = useMemo(() => {
    let result = posts;
    
    // Category filter
    if (selectedCategory !== 'All') {
      result = result.filter(post => post.category === selectedCategory);
    }
    
    // Time filter
    if (timeFilter !== 'All Time') {
      const now = Date.now();
      let timeLimit = 0;
      if (timeFilter === 'Today') timeLimit = now - 24 * 60 * 60 * 1000;
      if (timeFilter === 'This Week') timeLimit = now - 7 * 24 * 60 * 60 * 1000;
      if (timeFilter === 'This Month') timeLimit = now - 30 * 24 * 60 * 60 * 1000;
      result = result.filter(post => post.createdAt >= timeLimit);
    }

    // Search filter
    if (debouncedSearchTerm) {
      const lowercasedQuery = debouncedSearchTerm.toLowerCase();
      result = result.filter(post => 
        post.title.toLowerCase().includes(lowercasedQuery) ||
        post.content.toLowerCase().includes(lowercasedQuery)
      );
    }
    return result;
  }, [posts, selectedCategory, timeFilter, debouncedSearchTerm]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-900 text-gray-100">
        <header className="bg-gray-800 shadow-lg sticky top-0 z-20">
          <div className="container mx-auto px-4 py-6 flex justify-between items-center">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              <span className="text-cyan-400">TrendSpotter</span> AI Blog
            </h1>
            <nav>
              <a href="#posts" className="text-gray-300 hover:text-cyan-400 px-3 py-2 rounded-md text-sm font-medium">Trends</a>
            </nav>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <section id="hero" className="text-center mb-12">
            <h2 className="text-5xl font-extrabold text-white mb-4 leading-tight">
              Not Just <span className="text-cyan-400">What's</span> Trending, But <span className="text-cyan-400">Why</span>.
            </h2>
            <p className="max-w-3xl mx-auto text-lg text-gray-300">
              Our AI analyzes the latest tech topics, generates stunning visuals, and provides fact-checked insights.
            </p>
          </section>
          
          <section id="controls" className="mb-12 p-6 bg-gray-800/50 rounded-xl space-y-6">
             <div className="max-w-xl mx-auto">
                <label htmlFor="search" className="sr-only">Search articles</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    type="search"
                    name="search"
                    id="search"
                    className="block w-full bg-gray-700 border border-gray-600 rounded-md py-2 pl-10 pr-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                    placeholder="Search articles..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
             </div>
            <div className="space-y-4">
              <div className="flex justify-center items-center gap-2 flex-wrap">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                        selectedCategory === category
                          ? 'bg-cyan-500 text-white shadow-lg'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
              </div>
               <div className="flex justify-center items-center gap-2 flex-wrap border-t border-gray-700 pt-4">
                  {timeFilters.map(filter => (
                    <button
                      key={filter}
                      onClick={() => setTimeFilter(filter)}
                      className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                        timeFilter === filter
                          ? 'bg-cyan-600 text-white shadow-md'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
              </div>
            </div>
          </section>

          <section id="posts">
            {loading && posts.length === 0 && (
              <div className="text-center">
                <p className="text-lg text-gray-400">Our AI is crafting the latest insights for you...</p>
                <div className="mt-4 w-full bg-gray-700 rounded-full h-2.5">
                  <div className="bg-cyan-400 h-2.5 rounded-full animate-pulse" style={{ width: '45%' }}></div>
                </div>
              </div>
            )}
            {error && <p className="text-center text-red-400">{error}</p>}
            {!loading && !error && posts.length === 0 && <p className="text-center text-gray-400">No posts available at the moment.</p>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredPosts.length > 0 ? (
                filteredPosts.map(post => (
                  <article
                    key={post.slug}
                    id={post.slug}
                    className={`flex flex-col bg-gray-800 rounded-xl overflow-hidden shadow-2xl transform transition-all duration-500 hover:scale-105 hover:shadow-cyan-500/20 ${highlightedPost === post.slug ? 'ring-4 ring-cyan-500 scale-105' : 'ring-2 ring-transparent'}`}
                  >
                    <img src={post.imageUrl} alt={`Hero image for ${post.title}`} className="w-full h-48 object-cover" />
                    <div className="p-6 flex flex-col flex-grow">
                      <h3 className="text-xl font-bold text-white mb-2">{post.title}</h3>
                      <p className="text-sm font-medium text-cyan-400 mb-4">{post.category}</p>
                      <div
                        className="prose prose-invert text-gray-300 flex-grow"
                        dangerouslySetInnerHTML={{ __html: marked(post.content) }}
                      />
                      {post.sources.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-gray-700">
                          <h4 className="text-sm font-semibold text-gray-400 mb-2">Sources:</h4>
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {post.sources.map((source, index) => (
                              <li key={index}>
                                <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                                  {source.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <ShareButtons post={post} />
                    </div>
                  </article>
                ))
              ) : (
                !loading && <p className="text-center col-span-full text-gray-400">No posts found matching your criteria.</p>
              )}
            </div>
            
          </section>
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default App;
