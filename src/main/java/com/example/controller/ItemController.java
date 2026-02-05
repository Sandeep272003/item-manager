package com.example.controller;

import com.example.model.Item;
import com.example.service.ItemService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/items")
@Validated
public class ItemController {
    private final ItemService service;

    public ItemController(ItemService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<Item> create(@Valid @RequestBody Item request) {
        if (request.getName() == null || request.getName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        Item created = service.create(request);
        return ResponseEntity.created(URI.create("/api/items/" + created.getId())).body(created);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Item> get(@PathVariable @Min(1) Long id) {
        return service.getById(id).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Item> update(@PathVariable @Min(1) Long id, @Valid @RequestBody Item request) {
        return service.update(id, request).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable @Min(1) Long id) {
        boolean removed = service.delete(id);
        return removed ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String sort
    ) {
        List<Item> items = service.list(q, sort, page, size);
        int total = service.count(q);
        Map<String, Object> resp = new HashMap<>();
        resp.put("items", items);
        resp.put("page", page);
        resp.put("size", size);
        resp.put("total", total);
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/export")
    public ResponseEntity<List<Item>> exportAll() {
        return ResponseEntity.ok(service.exportAll());
    }
}
