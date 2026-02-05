package com.example.repository;

import com.example.model.Item;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Repository;

import jakarta.annotation.PostConstruct;
import java.io.File;
import java.nio.file.Files;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Repository
public class ItemRepository {
    private final List<Item> items = Collections.synchronizedList(new ArrayList<>());
    private final AtomicLong idGenerator = new AtomicLong(1);
    private final ObjectMapper mapper = new ObjectMapper();
    private final File storageFile;

    public ItemRepository() {
        this.storageFile = new File("data/items.json");
        mapper.findAndRegisterModules();
    }

    @PostConstruct
    public void init() {
        try {
            if (!storageFile.getParentFile().exists()) {
                storageFile.getParentFile().mkdirs();
            }
            if (storageFile.exists()) {
                byte[] bytes = Files.readAllBytes(storageFile.toPath());
                if (bytes.length > 0) {
                    List<Item> loaded = mapper.readValue(bytes, new TypeReference<List<Item>>() {});
                    items.addAll(loaded);
                    long maxId = loaded.stream().mapToLong(i -> i.getId() == null ? 0L : i.getId()).max().orElse(0L);
                    idGenerator.set(maxId + 1);
                }
            } else {
                mapper.writeValue(storageFile, items);
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to initialize storage file", e);
        }
    }

    private synchronized void persist() {
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(storageFile, items);
        } catch (Exception e) {
            throw new RuntimeException("Failed to persist items", e);
        }
    }

    public synchronized Item save(Item item) {
        if (item.getId() == null) {
            item.setId(idGenerator.getAndIncrement());
            item.setCreatedAt(Instant.now());
        }
        item.setUpdatedAt(Instant.now());
        // remove existing with same id if updating
        items.removeIf(i -> Objects.equals(i.getId(), item.getId()));
        items.add(item);
        persist();
        return item;
    }

    public Optional<Item> findById(Long id) {
        synchronized (items) {
            return items.stream().filter(i -> Objects.equals(i.getId(), id)).findFirst();
        }
    }

    public synchronized boolean deleteById(Long id) {
        boolean removed = items.removeIf(i -> Objects.equals(i.getId(), id));
        if (removed) persist();
        return removed;
    }

    public List<Item> findAll() {
        synchronized (items) {
            return new ArrayList<>(items);
        }
    }

    public List<Item> search(String q, String sort, int page, int size) {
        List<Item> filtered;
        synchronized (items) {
            filtered = items.stream()
                    .filter(i -> {
                        if (q == null || q.isBlank()) return true;
                        String lower = q.toLowerCase();
                        return (i.getName() != null && i.getName().toLowerCase().contains(lower))
                                || (i.getDescription() != null && i.getDescription().toLowerCase().contains(lower));
                    })
                    .collect(Collectors.toList());
        }

        if (sort != null && !sort.isBlank()) {
            String[] parts = sort.split(",");
            String field = parts[0];
            String dir = parts.length > 1 ? parts[1] : "asc";
            Comparator<Item> comparator = Comparator.comparing(Item::getId);
            if ("name".equalsIgnoreCase(field)) comparator = Comparator.comparing(i -> Optional.ofNullable(i.getName()).orElse(""));
            if ("price".equalsIgnoreCase(field)) comparator = Comparator.comparing(i -> Optional.ofNullable(i.getPrice()).orElse(0.0));
            if ("createdAt".equalsIgnoreCase(field)) comparator = Comparator.comparing(i -> Optional.ofNullable(i.getCreatedAt()).orElse(Instant.EPOCH));
            if ("desc".equalsIgnoreCase(dir)) comparator = comparator.reversed();
            filtered.sort(comparator);
        }

        int from = Math.max(0, page * size);
        int to = Math.min(filtered.size(), from + size);
        if (from > to) return Collections.emptyList();
        return filtered.subList(from, to);
    }

    public int count(String q) {
        synchronized (items) {
            if (q == null || q.isBlank()) return items.size();
            String lower = q.toLowerCase();
            return (int) items.stream()
                    .filter(i -> (i.getName() != null && i.getName().toLowerCase().contains(lower))
                            || (i.getDescription() != null && i.getDescription().toLowerCase().contains(lower)))
                    .count();
        }
    }
}
