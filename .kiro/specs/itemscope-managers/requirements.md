# Requirements Document

## Introduction

This document specifies requirements for adding ItemScope Manager support to the assign-gingerly library. ItemScope Managers are classes that manage DOM fragments and their associated data/view models, tied to elements with the itemscope attribute. This feature enables frameworks and libraries to manage light children of web components, DOM fragments from looping constructs, and scenarios where custom element wrapping is not feasible.

The implementation follows the existing EnhancementRegistry pattern, adding a parallel ItemscopeRegistry system to CustomElementRegistry.prototype and extending assignGingerly to handle the 'ish' (itemscope host) property.

## Glossary

- **ItemScope_Manager**: A class that manages data, view models, bindings, and event handling for a DOM element and its children
- **ItemscopeRegistry**: A registry class that stores and manages ItemScope_Manager configurations, similar to EnhancementRegistry
- **ISH_Property**: The 'ish' (itemscope host) property used in assignGingerly to instantiate and configure ItemScope Managers
- **Manager_Config**: Configuration object containing the manager class and lifecycle keys
- **Lazy_Registration**: Pattern where assignGingerly waits for a manager to be registered before instantiation
- **AssignGingerly**: The core function that merges properties into objects with enhanced capabilities
- **CustomElementRegistry**: The browser API for registering custom elements, extended with itemscopeRegistry

## Requirements

### Requirement 1: ItemscopeRegistry Class

**User Story:** As a library developer, I want a registry to store ItemScope Manager configurations, so that I can register and retrieve manager classes for DOM elements.

#### Acceptance Criteria

1. THE ItemscopeRegistry SHALL extend EventTarget
2. THE ItemscopeRegistry SHALL maintain a private map of manager names to Manager_Config objects
3. WHEN a manager is defined with a name that already exists, THE ItemscopeRegistry SHALL throw an error with message "Already registered"
4. WHEN a manager is successfully defined, THE ItemscopeRegistry SHALL dispatch an Event with the manager name as the event type
5. WHEN a manager name is requested via get method, THE ItemscopeRegistry SHALL return the corresponding Manager_Config or undefined

### Requirement 2: Manager Configuration Structure

**User Story:** As a library developer, I want to define manager configurations with minimal required properties, so that I can register lightweight manager classes.

#### Acceptance Criteria

1. THE Manager_Config SHALL include a manager property of type ItemScope_Manager constructor
2. THE Manager_Config SHALL include an optional lifecycleKeys property
3. WHERE lifecycleKeys is defined, THE Manager_Config SHALL support string or symbol keys for lifecycle methods
4. THE ItemScope_Manager constructor SHALL accept an HTMLElement as the first parameter
5. THE ItemScope_Manager constructor SHALL accept an optional initVals object as the second parameter

### Requirement 3: CustomElementRegistry Extension

**User Story:** As a developer, I want to access the itemscopeRegistry from any CustomElementRegistry instance, so that I can register managers in the appropriate scope.

#### Acceptance Criteria

1. WHEN CustomElementRegistry is defined in the environment, THE library SHALL add an itemscopeRegistry property to CustomElementRegistry.prototype
2. THE itemscopeRegistry property SHALL be implemented as a lazy getter
3. WHEN itemscopeRegistry is first accessed, THE getter SHALL create a new ItemscopeRegistry instance
4. WHEN itemscopeRegistry is first accessed, THE getter SHALL replace itself with a value property containing the registry instance
5. THE itemscopeRegistry property SHALL be non-enumerable and configurable

### Requirement 4: ISH Property Detection

**User Story:** As a developer, I want assignGingerly to detect when I assign an 'ish' property to an HTMLElement, so that the appropriate manager can be instantiated, while allowing 'ish' as a normal property on non-HTMLElement objects.

#### Acceptance Criteria

1. WHEN assignGingerly processes a source object with an 'ish' key, THE AssignGingerly SHALL check if the target is an HTMLElement
2. IF the target is not an HTMLElement, THEN THE AssignGingerly SHALL treat 'ish' as a normal property and assign it using standard assignment rules
3. WHEN the target is an HTMLElement with an 'ish' property assignment, THE AssignGingerly SHALL verify the element has an itemscope attribute
4. IF the target is an HTMLElement and the itemscope attribute is not set to a string value, THEN THE AssignGingerly SHALL throw an error with a descriptive message
5. WHEN the target is an HTMLElement with an itemscope attribute and the 'ish' property value is not an object, THE AssignGingerly SHALL throw an error

### Requirement 5: ISH Property Initialization

**User Story:** As a developer, I want the 'ish' property to be created on my element instance, so that I can access and modify the manager instance.

#### Acceptance Criteria

1. WHEN assignGingerly processes an 'ish' property for the first time on an element, THE AssignGingerly SHALL define an 'ish' property on that element instance
2. THE 'ish' property getter SHALL return the instantiated manager instance
3. THE 'ish' property setter SHALL queue the new value for assignment
4. THE 'ish' property setter SHALL trigger assignGingerly on the manager instance with the queued values
5. THE 'ish' property SHALL be enumerable and configurable
6. WHEN the 'ish' property setter receives the same instance, THE setter SHALL return without queuing

### Requirement 6: Manager Registration Lookup

**User Story:** As a developer, I want assignGingerly to check if my manager is registered, so that it can instantiate the correct manager class.

#### Acceptance Criteria

1. WHEN processing an 'ish' property, THE AssignGingerly SHALL extract the itemscope attribute value from the element
2. WHEN the element has a customElementRegistry property, THE AssignGingerly SHALL use that registry's itemscopeRegistry
3. WHEN the element does not have a customElementRegistry property, THE AssignGingerly SHALL use the global customElements.itemscopeRegistry
4. THE AssignGingerly SHALL call the get method on itemscopeRegistry with the itemscope attribute value
5. THE AssignGingerly SHALL determine if the manager is registered based on whether get returns a Manager_Config

### Requirement 7: Lazy Registration Support

**User Story:** As a developer, I want assignGingerly to wait for manager registration if not yet defined, so that I can assign 'ish' properties before the manager class is loaded.

#### Acceptance Criteria

1. WHEN a manager is not yet registered, THE AssignGingerly SHALL queue the 'ish' property value for later assignment
2. WHEN a manager is not yet registered, THE AssignGingerly SHALL use waitForEvent to listen for the manager name event on itemscopeRegistry
3. WHEN the manager registration event is fired, THE AssignGingerly SHALL instantiate the manager class
4. WHEN the manager is instantiated after lazy registration, THE AssignGingerly SHALL process all queued values
5. THE AssignGingerly SHALL pass the element as the first parameter to the manager constructor
6. THE AssignGingerly SHALL pass queued values as the second parameter to the manager constructor

### Requirement 8: Immediate Manager Instantiation

**User Story:** As a developer, I want the manager to be instantiated immediately when already registered, so that my code executes without delay.

#### Acceptance Criteria

1. WHEN a manager is already registered, THE AssignGingerly SHALL instantiate the manager class immediately
2. THE AssignGingerly SHALL pass the HTMLElement as the first parameter to the manager constructor
3. THE AssignGingerly SHALL pass the 'ish' property value as the second parameter to the manager constructor
4. WHEN the manager is instantiated, THE AssignGingerly SHALL define the 'ish' property on the element
5. WHEN the manager is instantiated, THE AssignGingerly SHALL assign the initial values to the manager instance using assignGingerly

### Requirement 9: Manager Instance Assignment

**User Story:** As a developer, I want values assigned to the 'ish' property to be merged into the manager instance, so that I can update the manager state.

#### Acceptance Criteria

1. WHEN values are assigned to the 'ish' property, THE setter SHALL add them to an internal queue
2. WHEN processing queued values, THE AssignGingerly SHALL call assignGingerly on the manager instance with each queued value
3. WHEN all queued values are processed, THE queue SHALL be empty
4. WHEN assignGingerly is called on the manager instance, THE AssignGingerly SHALL use the same options as the parent call
5. THE AssignGingerly SHALL process queued values in FIFO order

### Requirement 10: Manager Instance Caching

**User Story:** As a developer, I want the manager instance to be cached on the element, so that subsequent 'ish' property accesses return the same instance.

#### Acceptance Criteria

1. WHEN the 'ish' property is accessed after initialization, THE getter SHALL return the cached manager instance
2. THE manager instance SHALL be stored in a closure variable accessible to the getter and setter
3. WHEN assignGingerly is called multiple times with 'ish' properties on the same element, THE AssignGingerly SHALL reuse the existing manager instance
4. THE AssignGingerly SHALL not create multiple manager instances for the same element
5. WHEN the 'ish' property is reassigned with a new object, THE setter SHALL merge the new object into the existing manager instance

### Requirement 11: Error Handling for Invalid Configurations

**User Story:** As a developer, I want clear error messages when I misconfigure ItemScope Managers, so that I can quickly identify and fix issues.

#### Acceptance Criteria

1. WHEN an HTMLElement with an 'ish' property does not have an itemscope attribute, THE AssignGingerly SHALL throw an error with message "Element must have itemscope attribute set to a string value"
2. WHEN an HTMLElement has an itemscope attribute that is an empty string, THE AssignGingerly SHALL throw an error with message "itemscope attribute must be a non-empty string"
3. WHEN an HTMLElement with an itemscope attribute has an 'ish' property value that is not an object, THE AssignGingerly SHALL throw an error with message "ish property value must be an object"
4. WHEN a manager name is already registered in ItemscopeRegistry, THE ItemscopeRegistry SHALL throw an error with message "Already registered"
5. THE error messages SHALL clearly indicate which element or configuration caused the error

### Requirement 12: Integration with Existing assignGingerly Features

**User Story:** As a developer, I want ItemScope Manager support to work seamlessly with existing assignGingerly features, so that I can use all capabilities together.

#### Acceptance Criteria

1. WHEN assignGingerly processes an object with both 'ish' and other properties, THE AssignGingerly SHALL process the 'ish' property according to ItemScope Manager rules
2. WHEN assignGingerly processes an object with both 'ish' and other properties, THE AssignGingerly SHALL process other properties according to existing assignGingerly rules
3. THE 'ish' property processing SHALL not interfere with nested path notation (?.property)
4. THE 'ish' property processing SHALL not interfere with command notation (+=, =!, -=)
5. THE 'ish' property processing SHALL not interfere with symbol-based dependency injection
