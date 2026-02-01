# Java Member Viewer

Open a `.java` file and see fields and methods grouped by access in the Explorer side panel.

## Run

1. `npm install`
2. Press `F5` to launch the Extension Development Host.
3. Open `demo/Sample.java` to verify the TreeView.

## Expected View

```
Sample.java
 ├── Fields
 │    ├── private int count
 │    ├── public String name
 ├── Methods
 │    ├── private void init()
 │    ├── public int getCount()
```

## Notes

- `protected` members are shown with their own color.
- Constructors are ignored.
