import { describe, it, expect } from 'vitest';
import {
  sanitizeGoogleMapsEmbedUrl,
  sanitizeYouTubeEmbedUrl,
} from './embed-sanitizer';

describe('sanitizeGoogleMapsEmbedUrl', () => {
  it('returns null for null, undefined, empty, or whitespace', () => {
    expect(sanitizeGoogleMapsEmbedUrl(null)).toBeNull();
    expect(sanitizeGoogleMapsEmbedUrl(undefined)).toBeNull();
    expect(sanitizeGoogleMapsEmbedUrl('')).toBeNull();
    expect(sanitizeGoogleMapsEmbedUrl('   ')).toBeNull();
  });

  it('extracts src from full Google Maps iframe (exact user example)', () => {
    const iframe = '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3654.105795656481!2d-46.5306236!3d-23.6721743!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x94ce426ee87e60d5%3A0xaa28815c6f15d7df!2sParque%20Central%20-%20Santo%20Andr%C3%A9!5e0!3m2!1spt-BR!2sbr!4v1792673603157!5m2!1spt-BR!2sbr" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    expect(sanitizeGoogleMapsEmbedUrl(iframe)).toBe(
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3654.105795656481!2d-46.5306236!3d-23.6721743!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x94ce426ee87e60d5%3A0xaa28815c6f15d7df!2sParque%20Central%20-%20Santo%20Andr%C3%A9!5e0!3m2!1spt-BR!2sbr!4v1792673603157!5m2!1spt-BR!2sbr'
    );
  });

  it('extracts protocol-relative iframe src with https prefix', () => {
    const iframe = '<iframe src="//www.google.com/maps/embed?pb=123"></iframe>';
    expect(sanitizeGoogleMapsEmbedUrl(iframe)).toBe('https://www.google.com/maps/embed?pb=123');
  });

  it('handles direct http or https Google Maps URLs', () => {
    const url = 'https://www.google.com/maps/embed?pb=123';
    expect(sanitizeGoogleMapsEmbedUrl(url)).toBe(url);
    expect(sanitizeGoogleMapsEmbedUrl('http://maps.google.com/?q=test')).toBe('http://maps.google.com/?q=test');
    expect(sanitizeGoogleMapsEmbedUrl('//maps.google.com/?q=test')).toBe('https://maps.google.com/?q=test');
  });

  it('returns null for invalid html tags without src or random text', () => {
    expect(sanitizeGoogleMapsEmbedUrl('<div>nao e iframe</div>')).toBeNull();
    expect(sanitizeGoogleMapsEmbedUrl('not a valid url')).toBeNull();
  });
});

describe('sanitizeYouTubeEmbedUrl', () => {
  it('returns null for null, undefined, empty, or whitespace', () => {
    expect(sanitizeYouTubeEmbedUrl(null)).toBeNull();
    expect(sanitizeYouTubeEmbedUrl(undefined)).toBeNull();
    expect(sanitizeYouTubeEmbedUrl('')).toBeNull();
    expect(sanitizeYouTubeEmbedUrl('   ')).toBeNull();
  });

  it('extracts src and converts from full YouTube iframe (exact user example)', () => {
    const iframe = '<iframe width="1442" height="811" src="https://www.youtube.com/embed/nwcN5YZsLdA" title="Attack on Titan episode 78-80 in real-time" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
    expect(sanitizeYouTubeEmbedUrl(iframe)).toBe('https://www.youtube.com/embed/nwcN5YZsLdA');
  });

  it('converts standard watch?v= URL to embed URL', () => {
    expect(sanitizeYouTubeEmbedUrl('https://www.youtube.com/watch?v=nwcN5YZsLdA')).toBe('https://www.youtube.com/embed/nwcN5YZsLdA');
    expect(sanitizeYouTubeEmbedUrl('https://www.youtube.com/watch?feature=shared&v=nwcN5YZsLdA&t=10s')).toBe('https://www.youtube.com/embed/nwcN5YZsLdA');
  });

  it('converts youtu.be short URL to embed URL', () => {
    expect(sanitizeYouTubeEmbedUrl('https://youtu.be/nwcN5YZsLdA')).toBe('https://www.youtube.com/embed/nwcN5YZsLdA');
    expect(sanitizeYouTubeEmbedUrl('https://youtu.be/nwcN5YZsLdA?t=123')).toBe('https://www.youtube.com/embed/nwcN5YZsLdA');
  });

  it('converts youtube.com/shorts/ URL to embed URL', () => {
    expect(sanitizeYouTubeEmbedUrl('https://www.youtube.com/shorts/nwcN5YZsLdA')).toBe('https://www.youtube.com/embed/nwcN5YZsLdA');
  });

  it('handles protocol-relative URLs', () => {
    expect(sanitizeYouTubeEmbedUrl('//www.youtube.com/watch?v=nwcN5YZsLdA')).toBe('https://www.youtube.com/embed/nwcN5YZsLdA');
  });

  it('preserves other direct video URLs if valid http/https', () => {
    expect(sanitizeYouTubeEmbedUrl('https://player.vimeo.com/video/12345')).toBe('https://player.vimeo.com/video/12345');
  });

  it('returns null for invalid html tags without src or non-urls', () => {
    expect(sanitizeYouTubeEmbedUrl('<div>nao e video</div>')).toBeNull();
    expect(sanitizeYouTubeEmbedUrl('not a video')).toBeNull();
  });
});
