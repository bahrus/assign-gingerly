# Implementation Plan: ItemScope Managers

## Overview

This implementation adds ItemScope Manager support to the assign-gingerly library, enabling classes to manage DOM fragments and their associated data/view models for elements with the itemscope attribute. The implementation follows the existing EnhancementRegistry pattern, adding a parallel ItemscopeRegistry system and extending assignGingerly to handle the 'ish' (itemscope host) property.

## Tasks

- [ ] 1. Set up ItemscopeRegistry infrastructure
  - [ ] 1.1 Implement ItemscopeRegistry class in assignGingerly.ts
    - Create ItemscopeRegistry class extending EventTarget
    - Implement private Map for storing manager configurations
    - Implement define method with duplicate registration check
    - Implement get method for retrieving configurations
    - Dispatch events on successful registration
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [ ]* 1.2 Write property tests for ItemscopeRegistry
    - **Property 1: Registry Define-Get Round Trip**
    - **Validates: Requirements 1.5**
    - **Property 2: Duplicate Registration Error**
    - **Validates: Requirements 1.3, 11.4**
    - **Property 3: Registration Event Dispatch**
    - **Validates: Requirements 1.4**
  
  - [ ] 1.3 Add type definitions for ItemscopeRegistry in types/assign-gingerly/types.d.ts
    - Define ItemscopeManager type (constructor signature)
    - Define ItemscopeManagerConfig interface
    - Export ItemscopeRegistry class type
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ]* 1.4 Write property tests for manager configuration structure
    - **Property 4: Manager Config Structure**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - **Property 5: Manager Constructor Parameters**
    - **Validates: Requirements 2.4, 2.5, 7.5, 7.6, 8.2, 8.3**

- [ ] 2. Extend CustomElementRegistry with itemscopeRegistry
  - [ ] 2.1 Add itemscopeRegistry property to CustomElementRegistry.prototype in object-extension.ts
    - Add TypeScript declaration for itemscopeRegistry property
    - Implement lazy getter pattern that creates ItemscopeRegistry instance
    - Implement self-replacing getter for singleton behavior
    - Set property as non-enumerable and configurable
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [ ]* 2.2 Write property test for registry instance caching
    - **Property 6: ItemscopeRegistry Instance Caching**
    - **Validates: Requirements 3.4**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement ISH property detection in assignGingerly
  - [ ] 4.1 Add 'ish' property detection logic in assignGingerly function
    - Check for 'ish' key in source object during first pass
    - Implement HTMLElement type check
    - Implement dual behavior: special handling for HTMLElements, normal assignment for others
    - Remove 'ish' from processedSource after handling to prevent double-processing
    - _Requirements: 4.1, 4.2_
  
  - [ ]* 4.2 Write property test for ISH property type discrimination
    - **Property 7: ISH Property Type Discrimination**
    - **Validates: Requirements 4.1, 4.2**
  
  - [ ] 4.3 Implement itemscope attribute validation
    - Check for itemscope attribute on HTMLElement
    - Validate attribute is non-empty string
    - Throw descriptive error if validation fails
    - _Requirements: 4.3, 4.4, 11.1, 11.2_
  
  - [ ]* 4.4 Write property test for itemscope attribute validation
    - **Property 8: Itemscope Attribute Validation**
    - **Validates: Requirements 4.3, 4.4, 11.1, 11.2**
  
  - [ ] 4.5 Implement ISH value type validation
    - Validate 'ish' property value is an object (not null, primitive, or array)
    - Throw error with message "ish property value must be an object" if validation fails
    - _Requirements: 4.5, 11.3_
  
  - [ ]* 4.6 Write property test for ISH value type validation
    - **Property 9: ISH Value Type Validation**
    - **Validates: Requirements 4.5, 11.3**

- [ ] 5. Implement ISH property initialization and definition
  - [ ] 5.1 Create handleIshProperty function in assignGingerly.ts
    - Implement validation for itemscope attribute
    - Implement validation for value type
    - Call defineIshProperty if 'ish' property doesn't exist on element
    - Queue value for assignment using property descriptor
    - _Requirements: 4.3, 4.4, 4.5_
  
  - [ ] 5.2 Create defineIshProperty function in assignGingerly.ts
    - Determine which registry to use (element's or global)
    - Check if manager is registered
    - Handle lazy registration using waitForEvent
    - Create closure variables for manager instance and value queue
    - Define 'ish' property with getter and setter
    - _Requirements: 5.1, 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ] 5.3 Implement 'ish' property getter
    - Return cached manager instance from closure
    - _Requirements: 5.2_
  
  - [ ] 5.4 Implement 'ish' property setter
    - Check if value is same instance (idempotence)
    - Queue new values
    - Instantiate manager if not yet created
    - Process queued values through assignGingerly
    - _Requirements: 5.3, 5.4, 5.6, 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ]* 5.5 Write property tests for ISH property behavior
    - **Property 10: ISH Property Definition**
    - **Validates: Requirements 5.1, 5.5**
    - **Property 11: ISH Property Getter Returns Manager**
    - **Validates: Requirements 5.2**
    - **Property 12: ISH Property Setter Merges Values**
    - **Validates: Requirements 5.3, 5.4, 9.2**
    - **Property 13: ISH Property Setter Idempotence**
    - **Validates: Requirements 5.6**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement manager registration lookup
  - [ ] 7.1 Implement registry selection logic in defineIshProperty
    - Check for element.customElementRegistry property
    - Fall back to global customElements if not present
    - Throw error if ItemscopeRegistry not available
    - _Requirements: 6.2, 6.3_
  
  - [ ] 7.2 Implement manager lookup by itemscope value
    - Extract itemscope attribute value from element
    - Call registry.get with itemscope value
    - Determine if manager is registered based on result
    - _Requirements: 6.1, 6.4, 6.5_
  
  - [ ]* 7.3 Write property tests for registry selection and lookup
    - **Property 14: Registry Selection**
    - **Validates: Requirements 6.2, 6.3**
    - **Property 15: Manager Lookup by Itemscope Value**
    - **Validates: Requirements 6.1, 6.4, 6.5**

- [ ] 8. Implement lazy registration support
  - [ ] 8.1 Implement waitForEvent integration in defineIshProperty
    - Import waitForEvent dynamically
    - Call waitForEvent with registry and manager name
    - Verify manager exists after event fires
    - Throw error if manager not found after event
    - _Requirements: 7.2, 7.3_
  
  - [ ] 8.2 Implement value queueing for lazy registration
    - Queue values in closure before manager instantiation
    - Merge all queued values into initVals for constructor
    - Clear queue after instantiation
    - _Requirements: 7.1, 7.4_
  
  - [ ]* 8.3 Write property tests for lazy registration
    - **Property 16: Lazy Registration Value Queueing**
    - **Validates: Requirements 7.1, 7.4**
    - **Property 17: Lazy Registration Event Waiting**
    - **Validates: Requirements 7.2, 7.3**

- [ ] 9. Implement immediate manager instantiation
  - [ ] 9.1 Implement immediate instantiation path in defineIshProperty
    - Check if manager config exists
    - Instantiate manager immediately if registered
    - Pass element as first parameter
    - Pass merged initVals as second parameter
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [ ]* 9.2 Write property test for immediate instantiation
    - **Property 18: Immediate Instantiation**
    - **Validates: Requirements 8.1**

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement manager instance caching and value processing
  - [ ] 11.1 Implement manager instance caching in 'ish' property closure
    - Store manager instance in closure variable
    - Return same instance on subsequent getter calls
    - Prevent re-instantiation on reassignment
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [ ] 11.2 Implement value merging for existing manager instances
    - Queue new values when manager already exists
    - Process queue through assignGingerly with same options
    - Maintain FIFO order for value processing
    - _Requirements: 9.2, 9.4, 9.5, 10.5_
  
  - [ ]* 11.3 Write property tests for instance caching and value processing
    - **Property 19: Options Propagation**
    - **Validates: Requirements 9.4**
    - **Property 20: FIFO Value Processing**
    - **Validates: Requirements 9.5**
    - **Property 21: Single Manager Instance Per Element**
    - **Validates: Requirements 10.1, 10.3, 10.4**
    - **Property 22: ISH Property Reassignment Merges**
    - **Validates: Requirements 10.5**

- [ ] 12. Implement error handling and validation
  - [ ] 12.1 Add error context to all error messages
    - Include element tag name and itemscope value in errors
    - Include manager name in registration errors
    - Ensure consistent error message format
    - _Requirements: 11.5_
  
  - [ ]* 12.2 Write property test for error messages
    - **Property 23: Error Messages Include Context**
    - **Validates: Requirements 11.5**
  
  - [ ]* 12.3 Write unit tests for all error conditions
    - Test missing itemscope attribute error
    - Test empty itemscope attribute error
    - Test invalid ISH value type error
    - Test duplicate registration error
    - Test manager not found after event error
    - Test ItemscopeRegistry not available error

- [ ] 13. Verify integration with existing assignGingerly features
  - [ ] 13.1 Test ISH property with other properties
    - Verify 'ish' and other properties can coexist
    - Verify both are processed correctly
    - _Requirements: 12.1, 12.2_
  
  - [ ] 13.2 Test ISH property with nested path notation
    - Verify 'ish' works with ?.property syntax
    - Verify no interference between features
    - _Requirements: 12.3_
  
  - [ ] 13.3 Test ISH property with command notation
    - Verify 'ish' works with +=, =!, -= commands
    - Verify no interference between features
    - _Requirements: 12.4_
  
  - [ ] 13.4 Test ISH property with symbol injection
    - Verify 'ish' works with symbol-based dependency injection
    - Verify no interference between features
    - _Requirements: 12.5_
  
  - [ ]* 13.5 Write property tests for feature integration
    - **Property 24: ISH Property Coexists with Other Properties**
    - **Validates: Requirements 12.1, 12.2**
    - **Property 25: ISH Property Compatible with Nested Paths**
    - **Validates: Requirements 12.3**
    - **Property 26: ISH Property Compatible with Commands**
    - **Validates: Requirements 12.4**
    - **Property 27: ISH Property Compatible with Symbol Injection**
    - **Validates: Requirements 12.5**

- [ ] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties across all inputs
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript as specified in the design document
- All 27 correctness properties from the design are covered by property tests
- Checkpoints ensure incremental validation at reasonable breaks
