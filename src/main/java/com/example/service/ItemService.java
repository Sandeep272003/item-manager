package com.example.service;

import com.example.model.Item;
import com.example.repository.ItemRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class ItemService {
    private final ItemRepository repo;

    public ItemService(ItemRepository repo) {
        this.repo = repo;
    }

    public Item create(Item item) {
        return repo.save(item);
    }

    public Optional<Item> getById(Long id) {
        return repo.findById(id);
    }

    public Optional<Item> update(Long id, Item update) {
        return repo.findById(id).map(existing -> {
            existing.setName(update.getName());
            existing.setDescription(update.getDescription());
            existing.setPrice(update.getPrice());
            return repo.save(existing);
        });
    }

    public boolean delete(Long id) {
        return repo.deleteById(id);
    }

    public List<Item> list(String q, String sort, int page, int size) {
        return repo.search(q, sort, page, size);
    }

    public int count(String q) {
        return repo.count(q);
    }

    public List<Item> exportAll() {
        return repo.findAll();
    }
}
