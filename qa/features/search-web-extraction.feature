Feature: Search and web extraction

  @search @extraction @preview
  Scenario: User searches and extracts a readable article preview
    Given I navigate to "/search-test?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-search-test-ready='true']
    And I type "local AI engineering" into the field "Query"
    And I click the button "Run search"
    And I wait for css:.search-result-list
    And I click the button "Select result Local AI engineering notes for deterministic agents"
    And I click the button "Extract selected result"
    And I wait for css:.document-preview
    Then css:.status-grid should contain text "healthy"
    And css:.search-result-list should contain text "Local AI engineering notes for deterministic agents"
    And css:.search-result-list should contain text "pap-fixture.example/articles/local-ai-engineering"
    And css:.document-preview should contain text "Local AI engineering notes for deterministic agents"
    And css:.document-preview should contain text "readability"
    And css:.document-preview should contain text "Personal Agent Platform uses deterministic search"
    And I should see the heading "Extraction completed"

  @search @extraction @trace
  Scenario: User opens search extraction trace evidence
    Given I navigate to "/search-test?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-search-test-ready='true']
    And I type "local AI engineering" into the field "Query"
    And I click the button "Run search"
    And I wait for css:.search-result-list
    And I click the button "Select result Local AI engineering notes for deterministic agents"
    And I click the button "Extract selected result"
    And I wait for css:.document-preview
    And I click the link "Open extraction execution detail"
    And I wait for the heading "Execution detail"
    Then css:.page-header should contain text "completed"
    And css:.trace-list should contain text "search web"
    And css:.trace-list should contain text "fetch URL"
    And css:.trace-list should contain text "extract readable content"
    And css:.trace-list should contain text "persist web evidence"
    And css:.trace-list should contain text "extraction method"
    And css:.trace-list should contain text "readability"

  @search @extraction @unsafe-url
  Scenario: User sees a safe error for an unsafe URL
    Given I navigate to "/search-test?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-search-test-ready='true']
    And I type "local AI engineering" into the field "Query"
    And I click the button "Run search"
    And I wait for css:.search-result-list
    And I click the button "Select result Blocked local-network control panel"
    And I click the button "Extract selected result"
    And I wait for css:[role='alert']
    Then css:[role='alert'] should contain text "WEB_FETCH_FAILED"
    And css:.result-error:not([role='alert']) should contain text "server-side fetch policy"

  @search @extraction @unsafe-url @trace
  Scenario: User opens unsafe URL policy trace evidence
    Given I navigate to "/search-test?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-search-test-ready='true']
    And I type "local AI engineering" into the field "Query"
    And I click the button "Run search"
    And I wait for css:.search-result-list
    And I click the button "Select result Blocked local-network control panel"
    And I click the button "Extract selected result"
    And I wait for css:[role='alert']
    And I click the link "Open failed execution detail"
    And I wait for the heading "Execution detail"
    Then css:.page-header should contain text "failed"
    And css:.trace-list should contain text "validate URL policy"
    And css:.trace-list should contain text "fetch_url_blocked"
    And css:.trace-list should contain text "persist web evidence"
