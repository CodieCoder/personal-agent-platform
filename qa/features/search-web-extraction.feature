Feature: Search and web extraction

  @search @extraction @preview
  Scenario: User searches with local provider and extracts a readable article preview
    Given I navigate to "/search-test?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-search-test-ready='true']
    And I type "Wikimedia Foundation AI strategy Wikipedia humans first" into the field "Query"
    And I click the button "Run search"
    And I wait for css:.search-result-list
    And I click css:.search-result-list li:first-child button
    And I click the button "Extract selected result"
    And I wait for css:.document-preview
    Then css:.status-grid should contain text "healthy"
    And css:.search-result-list should contain text "Select"
    And css:.document-preview should contain text "readability"
    And css:.document-preview should contain text "Words"
    And I should see the heading "Extraction completed"

  @search @extraction @trace
  Scenario: User opens search extraction trace evidence from local provider flow
    Given I navigate to "/search-test?workspaceId=workspace_qa_alpha"
    When I wait for css:[data-search-test-ready='true']
    And I type "Wikimedia Foundation AI strategy Wikipedia humans first" into the field "Query"
    And I click the button "Run search"
    And I wait for css:.search-result-list
    And I click css:.search-result-list li:first-child button
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
