import { useState, useEffect } from 'react';
import { Tag, tagsApi } from '../api/tags.api';
import { toast } from 'sonner';

export const useTags = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTags = async () => {
    try {
      setIsLoading(true);
      const data = await tagsApi.getTags();
      setTags(data);
    } catch (e) {
      const err = e as Error;
      toast.error(err.message || 'No se pudieron cargar las etiquetas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const createTag = async (name: string, color: string) => {
    const newTag = await tagsApi.createTag({ name, color });
    setTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)));
    return newTag;
  };

  return { tags, isLoading, createTag, refreshTags: fetchTags };
};
